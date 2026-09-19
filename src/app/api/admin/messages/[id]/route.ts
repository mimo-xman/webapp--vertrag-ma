import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { SupportMessage } from "@/models/SupportMessage";
import { logAdminAction } from "@/lib/audit";

// PATCH /api/admin/messages/[id] — toggle a support message between
// "active" and "closed".
//   closed = the team contacted the user by email and resolved the issue
//            (possibly over several exchanges).
//   Admins can re-activate a closed message at any time (switch button).
const schema = z.object({ closed: z.boolean() });

export async function PATCH(
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
  const message = await SupportMessage.findById(id);
  if (!message) {
    return NextResponse.json({ success: false, error: "Message introuvable" }, { status: 404 });
  }

  const now = new Date();
  if (parsed.data.closed) {
    message.status = "closed";
    message.closed_at = now;
    message.closed_by = auth.user._id;
  } else {
    message.status = "active";
    message.closed_at = null;
    message.closed_by = null;
  }
  await message.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "support_message.toggle",
    entity_type: "support_message",
    entity_id: id,
    details: `Message ${message.ref_id} ${parsed.data.closed ? "clôturé" : "ré-activé"}`,
  });

  return NextResponse.json({
    success: true,
    status: message.status,
    closed_at: message.closed_at,
  });
}
