import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";

// POST — approve the uploaded dossier: link saved into user doc,
// demande marked confirmed.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  const demande = await DossierDemandeForAdd.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "en_attente") {
    return NextResponse.json(
      { success: false, error: "Cette demande a déjà été traitée." },
      { status: 400 }
    );
  }

  demande.status = "confirmed";
  demande.confirmed_at = new Date();
  await demande.save();

  // Save the dossier link into the user document.
  await User.findByIdAndUpdate(demande.user_id, { dossier_pdf_link: demande.dossier_pdf_link });

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_add.confirm",
    entity_type: "dossier_demande_for_add",
    entity_id: id,
    details: `Dossier validé pour ${demande.ref_number}`,
  });

  return NextResponse.json({ success: true });
}
