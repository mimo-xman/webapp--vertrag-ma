import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { Postulation } from "@/models/Postulation";
import { Company } from "@/models/Company";

// GET /api/postulations — user's own postulations, paginated with filters.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const status = params.get("status");
  const search = params.get("search")?.trim();

  const filter: Record<string, unknown> = { user_id: auth.user._id };
  if (status && status !== "all") filter.status = status;

  if (search) {
    const companies = await Company.find({ name: { $regex: search, $options: "i" } })
      .select("_id")
      .lean();
    filter.company_id = { $in: companies.map((c) => c._id) };
  }

  const sortField = params.get("sort") || "scheduled_at";
  const sortOrder = params.get("order") === "desc" ? -1 : 1;
  const allowedSorts = ["scheduled_at", "posted_at", "status", "createdAt"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "scheduled_at"]: sortOrder,
  };

  const [items, total] = await Promise.all([
    Postulation.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: "company_id",
        select: "name categorie_ids",
        populate: { path: "categorie_ids", select: "name" },
      })
      .lean(),
    Postulation.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((p) => ({
      _id: String(p._id),
      status: p.status,
      scheduled_at: p.scheduled_at,
      posted_at: p.posted_at,
      failed_reason: p.failed_reason,
      company: p.company_id
        ? {
            _id: String((p.company_id as { _id: unknown })._id),
            name: (p.company_id as { name?: string }).name,
            categories: (
              (p.company_id as { categorie_ids?: { name: string }[] }).categorie_ids || []
            ).map((c) => c.name),
          }
        : null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export async function DELETE(request: NextRequest) {
  // Not exposed: users cannot delete postulations directly.
  return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
}
