import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/models/Setting";
import { User } from "@/models/User";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { DossierDeletionHistory } from "@/models/DossierDeletionHistory";

// GET /api/dossier - current dossier state + demandes history.
// GET /api/dossier?token=… - email-confirmation link for dossier deletion.
//   Performs the deletion and redirects to /dossier with a flag.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const confirmationToken = searchParams.get("token");

  // ── Email confirmation link: delete the dossier, then redirect ──
  if (confirmationToken) {
    await connectDB();
    const user = await User.findOne({
      dossier_delete_token: confirmationToken,
      dossier_delete_expires: { $gt: new Date() },
      dossier_pdf_link: { $ne: null },
    })
      .select(
        "dossier_pdf_link dossier_source_type dossier_source_demande_id dossier_source_ref_number"
      )
      .lean();

    if (!user) {
      return new NextResponse(invalidTokenPage(), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    await DossierDeletionHistory.create({
      user_id: user._id,
      dossier_pdf_link: user.dossier_pdf_link,
      source_type: user.dossier_source_type,
      source_demande_id: user.dossier_source_demande_id,
      source_ref_number: user.dossier_source_ref_number,
      deleted_at: new Date(),
    });

    await User.findByIdAndUpdate(user._id, {
      dossier_pdf_link: null,
      dossier_source_type: null,
      dossier_source_demande_id: null,
      dossier_source_ref_number: null,
      dossier_delete_token: null,
      dossier_delete_expires: null,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
    return NextResponse.redirect(`${appUrl}/dossier?dossier_deleted=1`, { status: 303 });
  }

  // ── Normal data fetch ──
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();

  const user = await User.findById(auth.user._id)
    .select(
      "dossier_pdf_link dossier_source_type dossier_source_demande_id dossier_source_ref_number"
    )
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
      source_demande_id: user?.dossier_source_demande_id
        ? String(user.dossier_source_demande_id)
        : null,
      source_ref_number: user?.dossier_source_ref_number || null,
    },
    creation_price: settings.dossier.creation_price,
    add_price: settings.dossier.add_price,
    whatsapp_url: settings.contact.whatsapp_url,
    demandes_add: addDemandes.map((d) => ({
      _id: String(d._id),
      ref_number: d.ref_number,
      status: d.status,
      active: d.active,
      message_on_failed: d.message_on_failed,
      confirmed_at: d.confirmed_at,
      payed_at: d.payed_at,
      createdAt: d.createdAt,
      cancelled_by: d.cancelled_by,
      cancelled_at: d.cancelled_at,
      cancel_message: d.cancel_message,
      price: d.price,
    })),
    demandes_create: createDemandes.map((d) => ({
      _id: String(d._id),
      ref_number: d.ref_number,
      status: d.status,
      active: d.active,
      price: d.price,
      traduction_price: d.traduction_price,
      payed_at: d.payed_at,
      dossier_ready_at: d.dossier_ready_at,
      completed_at: d.completed_at,
      createdAt: d.createdAt,
      cancelled_by: d.cancelled_by,
      cancelled_at: d.cancelled_at,
      cancel_message: d.cancel_message,
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

// DELETE /api/dossier - first call sends a confirmation email; the email
// link (GET ?token=…) performs the actual deletion.
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const { Postulation } = await import("@/models/Postulation");
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
    "dossier_pdf_link email full_name"
  ).lean();

  if (!user?.dossier_pdf_link) {
    return NextResponse.json(
      { success: false, error: "Aucun dossier à supprimer." },
      { status: 400 }
    );
  }

  // Send the confirmation email with a dedicated dossier-deletion token
  // (separate from the account-deletion token).
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  await User.findByIdAndUpdate(auth.user._id, {
    dossier_delete_token: token,
    dossier_delete_expires: expires,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
  const confirmUrl = `${appUrl}/api/dossier?token=${token}`;

  await sendEmail({
    to: user.email,
    subject: "Confirmation de suppression de votre dossier - Vertrag.ma",
    htmlContent: `
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
    requires_confirmation: true,
    message: "Un email de confirmation a été envoyé. Vérifiez votre boîte de réception.",
  });
}

function invalidTokenPage(): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Vertrag.ma</title>
<style>body{font-family:Helvetica,Arial,sans-serif;background:#f4f2ec;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{max-width:420px;background:#fff;border:1px solid #d8d5cc;padding:32px;text-align:center}
h1{color:#b3391f;font-size:18px;margin:0 0 8px}p{color:#71757c;font-size:14px;line-height:1.5}
a{color:#1e4475}</style></head>
<body><div class="card"><h1>Lien invalide ou expiré</h1>
<p>Le lien de suppression du dossier est invalide ou a expiré.</p>
<p><a href="/">Retour à Vertrag.ma</a></p></div></body></html>`;
}
