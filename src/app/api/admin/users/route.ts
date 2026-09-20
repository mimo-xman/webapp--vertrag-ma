import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { User } from "@/models/User";import { applyDateRange } from "@/lib/api-filters";


// GET - all users + admins, EXCLUDING the currently connected admin
// (their own account is managed from their profile page).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const search = params.get("search")?.trim();
  const roleFilter = params.get("role");
  const sortField = params.get("sort") || "createdAt";
  const sortOrder = params.get("order") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = { _id: { $ne: auth.user._id } };
  if (search) {
    filter.$or = [
      { full_name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (roleFilter && roleFilter !== "all") filter.role = roleFilter;
  // Date-range filter on the account creation date.
  applyDateRange(filter, params, "created", "createdAt");

  const allowedSorts = ["full_name", "email", "role", "createdAt", "active"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "createdAt"]: sortOrder,
  };

  const [items, total] = await Promise.all([
    User.find(filter)
      .select("full_name email role active suspended two_factor_enabled dossier_pdf_link createdAt")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((u) => ({
      _id: String(u._id),
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      active: u.active,
      suspended: Boolean(u.suspended),
      two_factor_enabled: u.two_factor_enabled,
      has_dossier: Boolean(u.dossier_pdf_link),
      createdAt: u.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
