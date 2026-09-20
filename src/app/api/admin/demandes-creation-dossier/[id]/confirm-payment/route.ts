import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { logAdminAction } from "@/lib/audit";

const schema = z.object({
  dossier_ready_at: z.string().optional(),
  traduction_price: z.number().min(0).optional(),
});

// POST - confirm payment: status → payed, optionally set the ready date
// and/or the diploma translation price paid by the user.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();
  const demande = await DossierDemandeForCreate.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "en_attente") {
    return NextResponse.json(
      { success: false, error: "Cette demande n'est pas en attente de paiement." },
      { status: 400 }
    );
  }

  demande.status = "payed";
  demande.payed_at = new Date();
  if (parsed.data.dossier_ready_at) {
    demande.dossier_ready_at = new Date(parsed.data.dossier_ready_at);
  }
  if (parsed.data.traduction_price !== undefined) {
    demande.traduction_price = parsed.data.traduction_price;
  }
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_create.confirm_payment",
    entity_type: "dossier_demande_for_create",
    entity_id: id,
    details: `Paiement confirmé pour ${demande.ref_number} (${demande.price} $${demande.traduction_price ? ` + ${demande.traduction_price} $ traduction` : ""})`,
  });

  return NextResponse.json({ success: true });
}
