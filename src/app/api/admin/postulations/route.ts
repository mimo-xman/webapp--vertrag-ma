import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { Company } from "@/models/Company";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";
import { applyDateRange } from "@/lib/api-filters";

// GET - all postulations, with user + company info, filterable by user.
// Date-range filters: scheduled_from/scheduled_to and posted_from/posted_to
// (ISO dates, inclusive - the end is expanded to 23:59:59 UTC).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const status = params.get("status");
  const userFilter = params.get("user");
  const search = params.get("search")?.trim();
  const sortField = params.get("sort") || "scheduled_at";
  const sortOrder = params.get("order") === "desc" ? -1 : 1;

  const filter: Record<string, unknown> = {};
  if (status && status !== "all") filter.status = status;
  if (userFilter && userFilter !== "all") filter.user_id = userFilter;

  // Date-range filters (inclusive; "to" covers the whole day in UTC).
  applyDateRange(filter, params, "scheduled", "scheduled_at");
  applyDateRange(filter, params, "posted", "posted_at");

  if (search) {
    const users = await User.find({
      $or: [
        { full_name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    })
      .select("_id")
      .lean();
    const companies = await Company.find({ name: { $regex: search, $options: "i" } })
      .select("_id")
      .lean();
    filter.$or = [{ user_id: { $in: users.map((u) => u._id) } }, { company_id: { $in: companies.map((c) => c._id) } }];
  }

  const allowedSorts = ["scheduled_at", "posted_at", "status", "createdAt", "updatedAt"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "scheduled_at"]: sortOrder,
  };

  const [items, total, users, companies] = await Promise.all([
    Postulation.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user_id", "full_name email")
      .populate("company_id", "name email")
      .lean(),
    Postulation.countDocuments(filter),
    User.find().select("full_name email").sort({ full_name: 1 }).limit(2000).lean(),
    Company.find().select("name email active").sort({ name: 1 }).limit(5000).lean(),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((p) => ({
      _id: String(p._id),
      status: p.status,
      scheduled_at: p.scheduled_at,
      posted_at: p.posted_at,
      failed_reason: p.failed_reason,
      mail_sender_id: p.mail_sender_id ? String(p.mail_sender_id) : null,
      demande_ref: p.demande_ref || null,
      created_by_admin: Boolean(p.created_by_admin),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      executions: (p.executions || []).map((e) => ({
        execution_id: String(e.execution_id),
        status: e.status,
        error: e.error,
        executed_at: e.executed_at,
      })),
      user: p.user_id
        ? { _id: String((p.user_id as { _id: unknown })._id), full_name: (p.user_id as { full_name?: string }).full_name, email: (p.user_id as { email?: string }).email }
        : null,
      company: p.company_id
        ? { _id: String((p.company_id as { _id: unknown })._id), name: (p.company_id as { name?: string }).name, email: (p.company_id as { email?: string }).email }
        : null,
    })),
    users: users.map((u) => ({ _id: String(u._id), label: `${u.full_name} (${u.email})` })),
    companies: companies.map((c) => ({
      _id: String(c._id),
      // "inactive" marker so the admin knows the company is deactivated -
      // manual creation stays allowed (deliberate admin action).
      label: `${c.name} (${c.email})${c.active === false ? " : inactive" : ""}`,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

const createSchema = z.object({
  user_id: z.string().min(1),
  company_id: z.string().min(1),
  scheduled_at: z.string().optional(),
  force: z.boolean().optional(),
});

// POST - manual creation by admin. If the company was already used by this
// user (lifetime anti-duplicate), returns 409 duplicate:true unless force=true.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();

  const duplicate = await Postulation.findOne({
    user_id: parsed.data.user_id,
    company_id: parsed.data.company_id,
  });
  if (duplicate && !parsed.data.force) {
    return NextResponse.json(
      { success: false, duplicate: true, error: "Cet utilisateur a déjà postulé à cette entreprise." },
      { status: 409 }
    );
  }

  const user = await User.findById(parsed.data.user_id).select("full_name dossier_pdf_link");
  const company = await Company.findById(parsed.data.company_id).select("name email");
  if (!user || !company) {
    return NextResponse.json(
      { success: false, error: "Utilisateur ou entreprise introuvable" },
      { status: 404 }
    );
  }
  if (!user.dossier_pdf_link) {
    return NextResponse.json(
      { success: false, error: "Cet utilisateur n'a pas de dossier actif : impossible de créer la postulation." },
      { status: 400 }
    );
  }

  const scheduled = parsed.data.scheduled_at ? new Date(parsed.data.scheduled_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);

  const postulation = await Postulation.create({
    user_id: parsed.data.user_id,
    company_id: parsed.data.company_id,
    scheduled_at: scheduled,
    created_by_admin: true, // manual admin creation (not from a demande)
    status: "en_attente",
  });

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "postulation.create",
    entity_type: "postulation",
    entity_id: String(postulation._id),
    details: `Postulation manuelle : ${user.full_name} → ${company.name}`,
  });

  return NextResponse.json({ success: true, data: { _id: String(postulation._id) } });
}
