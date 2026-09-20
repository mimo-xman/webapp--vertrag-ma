import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { AuditLog } from "@/models/AuditLog";
import { applyDateRange } from "@/lib/api-filters";

// GET - audit log entries (read-only for all admins).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 20)));
  const search = params.get("search")?.trim();
  const actionFilter = params.get("action");
  const sortField = params.get("sort") || "createdAt";
  const sortOrder = params.get("order") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { admin_email: { $regex: search, $options: "i" } },
      { action: { $regex: search, $options: "i" } },
      { details: { $regex: search, $options: "i" } },
    ];
  }
  if (actionFilter && actionFilter !== "all") filter.action = actionFilter;
  // Date-range filter on the entry date (inclusive whole days, UTC).
  applyDateRange(filter, params, "created", "createdAt");

  const allowedSorts = ["createdAt", "updatedAt", "action", "admin_email", "entity_type"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "createdAt"]: sortOrder,
  };

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((a) => ({
      _id: String(a._id),
      admin_email: a.admin_email,
      action: a.action,
      entity_type: a.entity_type,
      entity_id: a.entity_id,
      details: a.details,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
