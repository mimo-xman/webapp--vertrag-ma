import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { PostulationDemande } from "@/models/PostulationDemande";
import { logAdminAction } from "@/lib/audit";

// POST - reject a pending demande.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  const demande = await PostulationDemande.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "en_attente") {
    return NextResponse.json(
      { success: false, error: "Cette demande n'est pas en attente." },
      { status: 400 }
    );
  }

  demande.status = "canceled";
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "demande_postulation.reject",
    entity_type: "postulation_demande",
    entity_id: id,
    details: `Demande ${demande.ref_number} rejetée`,
  });

  return NextResponse.json({ success: true });
}
