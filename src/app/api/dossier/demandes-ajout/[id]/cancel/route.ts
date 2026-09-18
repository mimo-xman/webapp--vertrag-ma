import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";

// Cancel a pending add-demande (only while en_attente).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();

  const demande = await DossierDemandeForAdd.findOne({ _id: id, user_id: auth.user._id });
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "en_attente") {
    return NextResponse.json(
      { success: false, error: "Cette demande ne peut plus être annulée (seulement en attente)." },
      { status: 400 }
    );
  }

  demande.status = "cancelled";
  demande.active = false;
  demande.cancelled_by = "user";
  demande.cancelled_at = new Date();
  await demande.save();

  return NextResponse.json({ success: true, message: "Demande annulée" });
}
