import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { SupportMessage } from "@/models/SupportMessage";import { applyDateRange } from "@/lib/api-filters";


// GET /api/admin/messages - support messages inbox (paginated, searchable,
// filterable by status: active | closed).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const search = params.get("search")?.trim();
  const statusFilter = params.get("status");
  const sortField = params.get("sort") || "createdAt";
  const sortOrder = params.get("order") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { ref_id: { $regex: search, $options: "i" } },
      { full_name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
    ];
  }
  if (statusFilter && statusFilter !== "all") filter.status = statusFilter;
  // Date-range filter on the message date.
  applyDateRange(filter, params, "created", "createdAt");

  const allowedSorts = ["createdAt", "status", "full_name", "email", "ref_id"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "createdAt"]: sortOrder,
  };

  const [items, total, activeCount, closedCount] = await Promise.all([
    SupportMessage.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    SupportMessage.countDocuments(filter),
    SupportMessage.countDocuments({ status: "active" }),
    SupportMessage.countDocuments({ status: "closed" }),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((m) => ({
      _id: String(m._id),
      ref_id: m.ref_id,
      user_id: m.user_id ? String(m.user_id) : null,
      full_name: m.full_name,
      email: m.email,
      reason: m.reason,
      message: m.message,
      status: m.status,
      closed_at: m.closed_at,
      createdAt: m.createdAt,
    })),
    counts: { active: activeCount, closed: closedCount },
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
