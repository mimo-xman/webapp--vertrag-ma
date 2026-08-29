import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Category } from "@/models/Category";
import { Company } from "@/models/Company";
import { logAdminAction } from "@/lib/audit";

// GET — categories with company counts.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const search = params.get("search")?.trim();
  const sortField = params.get("sort") || "companies_count";
  const sortOrder = params.get("order") === "desc" ? -1 : 1;

  const match = search ? { name: { $regex: search, $options: "i" } } : {};
  const sort: Record<string, 1 | -1> = { [sortField === "companies_count" ? "companies_count" : sortField]: sortOrder };

  const [items, total] = await Promise.all([
    Category.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "companies",
          localField: "_id",
          foreignField: "categorie_ids",
          as: "companies",
        },
      },
      {
        $addFields: { companies_count: { $size: "$companies" } },
      },
      { $project: { companies: 0 } },
      { $sort: sort },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    Category.countDocuments(match),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((c) => ({
      _id: String(c._id),
      name: c.name,
      companies_count: c.companies_count,
      createdAt: c.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

const createSchema = z.object({ name: z.string().trim().min(2).max(60) });

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Nom invalide (2-60 caractères)" }, { status: 400 });
  }

  await connectDB();
  const existing = await Category.findOne({ name: { $regex: `^${parsed.data.name}$`, $options: "i" } });
  if (existing) {
    return NextResponse.json({ success: false, error: "Cette catégorie existe déjà" }, { status: 400 });
  }

  const category = await Category.create({ name: parsed.data.name });
  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "category.create",
    entity_type: "category",
    entity_id: String(category._id),
    details: `Catégorie « ${category.name} » créée`,
  });

  return NextResponse.json({
    success: true,
    data: { _id: String(category._id), name: category.name },
  });
}
