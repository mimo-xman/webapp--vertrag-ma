import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { logAdminAction } from "@/lib/audit";

const updateSchema = z.object({
  status: z.enum(["en_attente", "envoyee", "echouee", "re_execute"]).optional(),
  scheduled_at: z.string().optional(),
  failed_reason: z.string().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();
  const update: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.scheduled_at !== undefined) update.scheduled_at = new Date(parsed.data.scheduled_at);
  if (parsed.data.failed_reason !== undefined) update.failed_reason = parsed.data.failed_reason;

  const postulation = await Postulation.findByIdAndUpdate(id, update, { returnDocument: "after" });
  if (!postulation) {
    return NextResponse.json({ success: false, error: "Postulation introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "postulation.update",
    entity_type: "postulation",
    entity_id: id,
    details: `Postulation mise à jour (${Object.keys(update).join(", ")})`,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  await connectDB();
  const postulation = await Postulation.findByIdAndDelete(id);
  if (!postulation) {
    return NextResponse.json({ success: false, error: "Postulation introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "postulation.delete",
    entity_type: "postulation",
    entity_id: id,
    details: "Postulation supprimée",
  });

  return NextResponse.json({ success: true });
}
