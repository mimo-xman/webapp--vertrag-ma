import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/models/Setting";
import { User } from "@/models/User";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { DossierDeletionHistory } from "@/models/DossierDeletionHistory";
import { generateRefNumber } from "@/lib/audit";

// GET /api/dossier — current dossier state + demandes history.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();

  const user = await User.findById(auth.user._id)
    .select("dossier_pdf_link full_name email")
    .lean();

  const [addDemandes, createDemandes, deletionHistory] = await Promise.all([
    DossierDemandeForAdd.find({ user_id: auth.user._id }).sort({ createdAt: -1 }).lean(),
    DossierDemandeForCreate.find({ user_id: auth.user._id }).sort({ createdAt: -1 }).lean(),
    DossierDeletionHistory.find({ user_id: auth.user._id }).sort({ deleted_at: -1 }).lean(),
  ]);

  return NextResponse.json({
    success: true,
    dossier: {
      pdf_link: user?.dossier_pdf_link || null,
      status: user?.dossier_pdf_link ? "active" : "missing",
      source_type: user?.dossier_source_type || null,
      source_demande_id: user?.dossier_source_demande_id || null,
      source_ref_number: user?.dossier_source_ref_number || null,
    },
    creation_price: settings.dossier.creation_price,
    add_price: settings.dossier.add_price,
    whatsapp_url: settings.contact.whatsapp_url,
    demandes_add: addDemandes.map((d) => ({
      _id: String(d._id),
      ref_number: d.ref_number,
      status: d.status,
      message_on_failed: d.message_on_failed,
      confirmed_at: d.confirmed_at,
      createdAt: d.createdAt,
      cancelled_by: d.cancelled_by,
      cancelled_at: d.cancelled_at,
      price: d.price,
    })),
    demandes_create: createDemandes.map((d) => ({
      _id: String(d._id),
      ref_number: d.ref_number,
      status: d.status,
      price: d.price,
      traduction_price: d.traduction_price,
      payed_at: d.payed_at,
      dossier_ready_at: d.dossier_ready_at,
      completed_at: d.completed_at,
      createdAt: d.createdAt,
      cancelled_by: d.cancelled_by,
      cancelled_at: d.cancelled_at,
      dossier_pdf_link: d.dossier_pdf_link,
    })),
    deletion_history: deletionHistory.map((d) => ({
      _id: String(d._id),
      deleted_at: d.deleted_at,
      source_type: d.source_type,
      source_ref_number: d.source_ref_number,
      dossier_pdf_link: d.dossier_pdf_link,
    })),
  });
}

// DELETE /api/dossier — permanently delete the user's dossier.
// Blocked while postulations are pending (dossier required to send them).
// Requires email confirmation token sent to user.
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const confirmationToken = searchParams.get("token");

  await connectDB();
  const { Postulation } = await import("@/models/Postulation");
  const { DossierDeletionHistory } = await import("@/models/DossierDeletionHistory");
  const { sendEmail } = await import("@/lib/email");

  const pendingCount = await Postulation.countDocuments({
    user_id: auth.user._id,
    status: { $in: ["en_attente", "re_execute"] },
  });
  if (pendingCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Impossible de supprimer le dossier : vous avez des postulations en attente qui nécessitent un dossier.",
      },
      { status: 400 }
    );
  }

  const user = await User.findById(auth.user._id).select(
    "dossier_pdf_link dossier_source_type dossier_source_demande_id dossier_source_ref_number email full_name"
  ).lean();

  if (!user?.dossier_pdf_link) {
    return NextResponse.json(
      { success: false, error: "Aucun dossier à supprimer." },
      { status: 400 }
    );
  }

  // If no token provided, send confirmation email
  if (!confirmationToken) {
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await User.findByIdAndUpdate(auth.user._id, {
      delete_account_token: token,
      delete_account_expires: expires,
    });

    const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"}/api/dossier?token=${token}`;
    
    await sendEmail({
      to: user.email,
      subject: "Confirmation de suppression de votre dossier - Vertrag.ma",
      html: `
        <p>Bonjour ${user.full_name},</p>
        <p>Vous avez demandé la suppression de votre dossier sur Vertrag.ma.</p>
        <p>Cette action est <strong>irréversible</strong> : votre dossier sera définitivement supprimé et vous ne pourrez plus demander de postulations sans le re-téléverser.</p>
        <p><a href="${confirmUrl}" style="background: #b3391f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Confirmer la suppression</a></p>
        <p>Ce lien expire dans 24 heures.</p>
        <p>Si vous n'avez pas demandé cette suppression, ignorez cet email.</p>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "Un email de confirmation a été envoyé. Vérifiez votre boîte de réception.",
    });
  }

  // Verify token
  if (user.delete_account_token !== confirmationToken || !user.delete_account_expires || new Date() > user.delete_account_expires) {
    return NextResponse.json(
      { success: false, error: "Lien de confirmation invalide ou expiré." },
      { status: 400 }
    );
  }

  // Save deletion history
  await DossierDeletionHistory.create({
    user_id: auth.user._id,
    dossier_pdf_link: user.dossier_pdf_link,
    source_type: user.dossier_source_type,
    source_demande_id: user.dossier_source_demande_id,
    source_ref_number: user.dossier_source_ref_number,
    deleted_at: new Date(),
  });

  // Clear dossier and source info
  await User.findByIdAndUpdate(auth.user._id, {
    dossier_pdf_link: null,
    dossier_source_type: null,
    dossier_source_demande_id: null,
    dossier_source_ref_number: null,
    delete_account_token: null,
    delete_account_expires: null,
  });

  return NextResponse.json({ success: true, message: "Dossier supprimé" });
}
