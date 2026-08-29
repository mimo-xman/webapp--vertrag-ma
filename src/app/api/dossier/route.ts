import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/models/Setting";
import { User } from "@/models/User";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
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

  const [addDemandes, createDemandes] = await Promise.all([
    DossierDemandeForAdd.find({ user_id: auth.user._id }).sort({ createdAt: -1 }).lean(),
    DossierDemandeForCreate.find({ user_id: auth.user._id }).sort({ createdAt: -1 }).lean(),
  ]);

  return NextResponse.json({
    success: true,
    dossier: {
      pdf_link: user?.dossier_pdf_link || null,
      status: user?.dossier_pdf_link ? "active" : "missing",
    },
    creation_price: settings.dossier.creation_price,
    whatsapp_url: settings.contact.whatsapp_url,
    demandes_add: addDemandes.map((d) => ({
      _id: String(d._id),
      ref_number: d.ref_number,
      status: d.status,
      message_on_failed: d.message_on_failed,
      confirmed_at: d.confirmed_at,
      createdAt: d.createdAt,
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
    })),
  });
}

// DELETE /api/dossier — permanently delete the user's dossier.
// Blocked while postulations are pending (dossier required to send them).
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const { Postulation } = await import("@/models/Postulation");

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

  await User.findByIdAndUpdate(auth.user._id, { dossier_pdf_link: null });
  return NextResponse.json({ success: true, message: "Dossier supprimé" });
}
