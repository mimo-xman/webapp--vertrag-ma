import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { logAdminAction } from "@/lib/audit";

// POST — mark as in_creation (team is working on it)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  const demande = await DossierDemandeForCreate.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "payed") {
    return NextResponse.json(
      { success: false, error: "Cette demande doit être payée d'abord." },
      { status: 400 }
    );
  }

  demande.status = "in_creation";
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_create.mark_in_creation",
    entity_type: "dossier_demande_for_create",
    entity_id: id,
    details: `En cours de création : ${demande.ref_number}`,
  });

  return NextResponse.json({ success: true });
}
