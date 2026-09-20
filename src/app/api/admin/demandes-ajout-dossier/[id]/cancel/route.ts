import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { logAdminAction } from "@/lib/audit";

// POST - admin cancels an add-dossier demande.
// Allowed while the demande is still active (not confirmed/rejected/cancelled).
// When the payment has already been validated (payed_* statuses), a message
// is REQUIRED - it explains the cancellation to the user (e.g. refund).
const cancelSchema = z.object({
  message: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Requête invalide" }, { status: 400 });
  }

  await connectDB();

  const demande = await DossierDemandeForAdd.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }

  const activeStatuses = [
    "en_attente",
    "waiting_payment",
    "payed_waiting_review",
    "payed_in_review",
    "en_cours_de_revision",
  ];
  if (!activeStatuses.includes(demande.status)) {
    return NextResponse.json(
      { success: false, error: "Cette demande est déjà terminée (confirmée, rejetée ou annulée)." },
      { status: 400 }
    );
  }

  // After the payment was validated, a message is mandatory: the user paid
  // and deserves an explanation (typically with the refund arrangements).
  const isPayed = Boolean(demande.payed_at) || demande.status.startsWith("payed_");
  const message = (parsed.data.message || "").trim();
  if (isPayed && message.length < 5) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Un message est requis pour annuler une demande déjà payée (il sera visible par l'utilisateur).",
      },
      { status: 400 }
    );
  }

  demande.status = "cancelled";
  demande.active = false;
  demande.cancelled_by = "admin";
  demande.cancelled_at = new Date();
  demande.cancel_message = isPayed ? message : message || null;
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_add.cancel",
    entity_type: "dossier_demande_for_add",
    entity_id: id,
    details: `Demande annulée par l'admin · ${demande.ref_number}${isPayed ? " (après paiement, message fourni)" : ""}`,
  });

  return NextResponse.json({ success: true });
}
