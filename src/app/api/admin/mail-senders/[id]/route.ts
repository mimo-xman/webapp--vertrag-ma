import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { MailSender } from "@/models/MailSender";
import { logAdminAction } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  type: z.enum(["api", "smtp"]).optional(),
  api_key: z.string().optional().nullable(),
  smtp_config: z
    .object({
      host: z.string().trim().min(1),
      port: z.number().int().min(1).max(65535),
      username: z.string().trim().min(1),
      password: z.string().min(1),
    })
    .optional()
    .nullable(),
  active: z.boolean().optional(),
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
    return NextResponse.json({ success: false, error: "Configuration invalide" }, { status: 400 });
  }

  await connectDB();
  const sender = await MailSender.findById(id);
  if (!sender) {
    return NextResponse.json({ success: false, error: "Service introuvable" }, { status: 404 });
  }

  const { name, type, api_key, smtp_config, active } = parsed.data;
  const finalType = type || sender.type;

  if (finalType === "api" && api_key === null && !sender.api_key && !api_key) {
    return NextResponse.json({ success: false, error: "Clé API requise" }, { status: 400 });
  }
  if (finalType === "smtp" && smtp_config === null && !sender.smtp_config && !smtp_config) {
    return NextResponse.json({ success: false, error: "Configuration SMTP requise" }, { status: 400 });
  }

  if (name) sender.name = name;
  if (type) sender.type = type;
  if (active !== undefined) sender.active = active;
  if (api_key !== undefined && api_key !== null && finalType === "api") sender.api_key = api_key;
  if (api_key === null) sender.api_key = null;
  if (smtp_config !== undefined && smtp_config !== null && finalType === "smtp") {
    sender.smtp_config = smtp_config;
  }
  if (smtp_config === null) sender.smtp_config = null;

  await sender.save();

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "mail_sender.update",
    entity_type: "mail_sender",
    entity_id: id,
    details: `Service email « ${sender.name} » modifié`,
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
  const sender = await MailSender.findByIdAndDelete(id);
  if (!sender) {
    return NextResponse.json({ success: false, error: "Service introuvable" }, { status: 404 });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "mail_sender.delete",
    entity_type: "mail_sender",
    entity_id: id,
    details: `Service email « ${sender.name} » supprimé (${sender.usage_count} envois cumulés)`,
  });

  return NextResponse.json({ success: true });
}
