import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { logAdminAction } from "@/lib/audit";

const schema = z.object({ message: z.string().trim().min(5).max(2000) });

// POST — cancel a creation demande (by admin)
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
    return NextResponse.json(
      { success: false, error: "Message d'annulation requis (5 caractères minimum)" },
      { status: 400 }
    );
  }

  await connectDB();
  const demande = await DossierDemandeForCreate.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "en_attente" && demande.status !== "payed" && demande.status !== "in_creation") {
    return NextResponse.json(
      { success: false, error: "Cette demande ne peut plus être annulée." },
      { status: 400 }
    );
  }

  demande.status = "cancelled";
  demande.active = false;
  demande.cancelled_by = "admin";
  demande.cancelled_at = new Date();
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_create.cancel",
    entity_type: "dossier_demande_for_create",
    entity_id: id,
    details: `Demande de création annulée par admin : ${demande.ref_number} - ${parsed.data.message.slice(0, 120)}`,
  });

  return NextResponse.json({ success: true, message: "Demande annulée" });
}