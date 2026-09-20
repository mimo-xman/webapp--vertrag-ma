import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { logAdminAction } from "@/lib/audit";

// POST - mark as in review (admin is reviewing it, user cannot cancel).
// Two workflows, same endpoint:
//   free demande  : en_attente            → en_cours_de_revision
//   priced demande: payed_waiting_review  → payed_in_review
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

  if (demande.status === "waiting_payment") {
    return NextResponse.json(
      { success: false, error: "Validez d'abord le paiement de cette demande avant la révision." },
      { status: 400 }
    );
  }

  const targetStatus =
    demande.status === "payed_waiting_review" ? "payed_in_review" : "en_cours_de_revision";
  if (demande.status !== "en_attente" && demande.status !== "payed_waiting_review") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cette demande doit être en attente de révision pour être marquée en cours de révision.",
      },
      { status: 400 }
    );
  }

  demande.status = targetStatus;
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
