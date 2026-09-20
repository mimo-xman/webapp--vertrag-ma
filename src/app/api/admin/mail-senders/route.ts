import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { MailSender } from "@/models/MailSender";
import { logAdminAction } from "@/lib/audit";import { applyDateRange } from "@/lib/api-filters";


// GET - mail senders sorted by usage count (default) or other fields.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const search = params.get("search")?.trim();
  const typeFilter = params.get("type");
  const sortField = params.get("sort") || "usage_count";
  const sortOrder = params.get("order") === "desc" ? -1 : 1;

  const filter: Record<string, unknown> = {};
  if (search) filter.name = { $regex: search, $options: "i" };
  if (typeFilter && typeFilter !== "all") filter.type = typeFilter;
  // Date-range filter on the creation date.
  applyDateRange(filter, params, "created", "createdAt");

  const allowedSorts = ["name", "type", "usage_count", "success_count", "failed_count", "createdAt", "active"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "usage_count"]: sortOrder,
  };

  const [items, total] = await Promise.all([
    MailSender.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    MailSender.countDocuments(filter),
  ]);

  // UTC day boundaries - the same reference the executor uses for limits.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  return NextResponse.json({
    success: true,
    data: items.map((s) => {
      const todayUsage = (s.usage_log || []).filter(
        (at) => new Date(at).getTime() >= todayStart.getTime()
      ).length;
      return {
        _id: String(s._id),
        name: s.name,
        type: s.type,
        // Secrets are never returned - only a masked hint.
        has_api_key: Boolean(s.api_key),
        sender_email: s.sender_email || "",
        smtp_host: s.smtp_config?.host || "",
        smtp_port: s.smtp_config?.port || 587,
        active: s.active,
        in_use: Boolean(s.in_use),
        last_error: s.last_error || "",
        last_error_at: s.last_error_at,
        usage_count: s.usage_count,
        success_count: s.success_count,
        failed_count: s.failed_count,
        daily_limit: s.daily_limit || 0,
        today_usage: todayUsage,
        createdAt: s.createdAt,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.enum(["api", "smtp"]),
  // Brevo requires a sender email address on the account.
  sender_email: z.string().trim().email().max(200).optional().nullable(),
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
  // Max sends per UTC day - 0 (or omitted) = unlimited.
  daily_limit: z.number().int().min(0).max(1000000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Configuration invalide (vérifiez les champs selon le type)" },
      { status: 400 }
    );
  }

  const { name, type, sender_email, api_key, smtp_config, daily_limit } = parsed.data;
  if (type === "api" && !api_key) {
    return NextResponse.json({ success: false, error: "Clé API requise pour un service de type API" }, { status: 400 });
  }
  if (type === "api" && !sender_email) {
    return NextResponse.json(
      { success: false, error: "Email expéditeur requis pour un service de type API (Brevo exige une adresse sender)" },
      { status: 400 }
    );
  }
  if (type === "smtp" && !smtp_config) {
    return NextResponse.json({ success: false, error: "Configuration SMTP requise" }, { status: 400 });
  }

  await connectDB();
  const existing = await MailSender.findOne({ name });
  if (existing) {
    return NextResponse.json({ success: false, error: "Un service porte déjà ce nom" }, { status: 400 });
  }

  const sender = await MailSender.create({
    name,
    type,
    sender_email: type === "api" ? sender_email!.toLowerCase() : null,
    api_key: type === "api" ? api_key! : null,
    smtp_config: type === "smtp" ? smtp_config! : null,
    daily_limit: daily_limit ?? 0,
    active: true,
  });

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "mail_sender.create",
    entity_type: "mail_sender",
    entity_id: String(sender._id),
    details: `Service email « ${name} » (${type}) ajouté`,
  });

  return NextResponse.json({ success: true, data: { _id: String(sender._id) } });
}
