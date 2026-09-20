import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { PostulationDemande } from "@/models/PostulationDemande";
import { User } from "@/models/User";import { applyDateRange } from "@/lib/api-filters";


// GET - all postulation demandes (with user info).
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
  const sortField = params.get("sort") || "createdAt";
  const sortOrder = params.get("order") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (status && status !== "all") filter.status = status;
  if (userFilter && userFilter !== "all") filter.user_id = userFilter;
  // Date-range filter on the demande creation date.
  applyDateRange(filter, params, "created", "createdAt");
  if (search) {
    const users = await User.find({
      $or: [
        { full_name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    })
      .select("_id")
      .lean();
    filter.user_id = { $in: users.map((u) => u._id) };
  }

  const allowedSorts = ["createdAt", "updatedAt", "nmbr_total", "price", "status", "confirmed_at"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "createdAt"]: sortOrder,
  };

  const [items, total] = await Promise.all([
    PostulationDemande.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user_id", "full_name email")
      .populate("categorie_ids", "name")
      .lean(),
    PostulationDemande.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((d) => ({
      _id: String(d._id),
      ref_number: d.ref_number,
      nmbr_total: d.nmbr_total,
      nmbr_per_day: d.nmbr_per_day,
      price: d.price,
      // Pricing parameters in effect when this demande was created -
      // lets the admin see exactly how the price was computed even after
      // the settings have changed.
      pricing_snapshot: d.pricing_snapshot || null,
      status: d.status,
      confirmed_at: d.confirmed_at,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      categories: (d.categorie_ids as { name: string }[]).map((c) => c.name),
      user: d.user_id
        ? {
            _id: String((d.user_id as { _id: unknown })._id),
            full_name: (d.user_id as { full_name?: string }).full_name,
            email: (d.user_id as { email?: string }).email,
          }
        : null,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
