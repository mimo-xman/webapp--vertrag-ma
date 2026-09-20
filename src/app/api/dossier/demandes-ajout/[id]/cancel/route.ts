import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";

// Cancel a pending add-demande - allowed while en_attente (free) OR
// waiting_payment (priced, before the admin validates the payment).
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
  if (demande.status !== "en_attente" && demande.status !== "waiting_payment") {
    return NextResponse.json(
      {
        success: false,
        error: "Cette demande ne peut plus être annulée (paiement déjà validé ou révision en cours).",
      },
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
