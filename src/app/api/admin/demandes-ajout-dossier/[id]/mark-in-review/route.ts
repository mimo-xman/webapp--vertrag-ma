import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { logAdminAction } from "@/lib/audit";

// POST — mark as in_review (admin is reviewing it, user cannot cancel)
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
      { success: false, error: "Cette demande doit être en attente pour être marquée en cours de révision." },
      { status: 400 }
    );
  }

  demande.status = "en_cours_de_revision";
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_add.mark_in_review",
    entity_type: "dossier_demande_for_add",
    entity_id: id,
    details: `Dossier en cours de révision : ${demande.ref_number}`,
  });

  return NextResponse.json({ success: true });
}