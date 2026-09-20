import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { executeSinglePostulation } from "@/lib/postulation-executor";

// POST /api/admin/postulations/[id]/execute - manually execute ONE
// postulation with the admin-selected mail sender.
// Creates a dedicated Execution (trigger "admin") recording the attempt.
const schema = z.object({ mail_sender_id: z.string().min(1) });

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
    return NextResponse.json({ success: false, error: "Mail sender requis" }, { status: 400 });
  }

  await connectDB();

  try {
    const result = await executeSinglePostulation({
      postulation_id: id,
      mail_sender_id: parsed.data.mail_sender_id,
      admin_id: auth.user._id,
    });

    await logAdminAction({
      admin_id: auth.user._id,
      admin_email: auth.user.email,
      action: "postulation.execute",
      entity_type: "postulation",
      entity_id: id,
      details: `Exécution manuelle ${result.ref_number} · ${result.status === "success" ? "envoyée" : `échouée : ${result.error}`}${result.sender_disabled ? " (mail sender désactivé)" : ""}`,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur lors de l'exécution";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
