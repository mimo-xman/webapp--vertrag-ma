import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { logAdminAction } from "@/lib/audit";

// POST - validate the payment of a priced add-dossier demande (price > 0).
// waiting_payment → payed_waiting_review.
// After this, the classic review flow continues: mark in review → confirm /
// reject. The user can no longer cancel once the payment is validated.
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
  if (demande.status !== "waiting_payment") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cette demande n'est pas en attente de paiement (paiement déjà validé ou demande gratuite).",
      },
      { status: 400 }
    );
  }

  demande.status = "payed_waiting_review";
  demande.payed_at = new Date();
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_add.confirm_payment",
    entity_type: "dossier_demande_for_add",
    entity_id: id,
    details: `Paiement validé (${demande.price} $) · ${demande.ref_number}`,
  });

  return NextResponse.json({ success: true });
}
