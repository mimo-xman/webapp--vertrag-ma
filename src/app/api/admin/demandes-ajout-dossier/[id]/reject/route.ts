import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { logAdminAction } from "@/lib/audit";

const schema = z.object({ message: z.string().trim().min(5).max(2000) });

// POST - reject the uploaded dossier with an explanatory message.
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
      { success: false, error: "Message de rejet requis (5 caractères minimum)" },
      { status: 400 }
    );
  }

  await connectDB();
  const demande = await DossierDemandeForAdd.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  if (demande.status !== "en_attente" && demande.status !== "en_cours_de_revision" && demande.status !== "payed_waiting_review" && demande.status !== "payed_in_review") {
    return NextResponse.json(
      { success: false, error: "Cette demande a déjà été traitée." },
      { status: 400 }
    );
  }

  demande.status = "rejected";
  demande.message_on_failed = parsed.data.message;
  demande.active = false;
  await demande.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_add.reject",
    entity_type: "dossier_demande_for_add",
    entity_id: id,
    details: `Dossier rejeté pour ${demande.ref_number} : ${parsed.data.message.slice(0, 120)}`,
  });

  return NextResponse.json({ success: true });
}
