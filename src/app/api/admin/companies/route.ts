import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { Company } from "@/models/Company";
import { Category } from "@/models/Category";
import { logAdminAction } from "@/lib/audit";
import { EmailVerifier } from "@el-zazo/email-verifier";

// GET — companies list with category names, search/sort/pagination.
// ?status=active|inactive filters on the activation state.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const search = params.get("search")?.trim();
  const categoryFilter = params.get("category");
  const statusFilter = params.get("status");
  const sortField = params.get("sort") || "createdAt";
  const sortOrder = params.get("order") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (categoryFilter && categoryFilter !== "all") {
    filter.categorie_ids = categoryFilter;
  }
  if (statusFilter === "active") filter.active = true;
  else if (statusFilter === "inactive") filter.active = false;

  const allowedSorts = ["name", "email", "active", "createdAt", "updatedAt"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "createdAt"]: sortOrder,
  };

  const [items, total] = await Promise.all([
    Company.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("categorie_ids", "name")
      .lean(),
    Company.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map((c) => ({
      _id: String(c._id),
      name: c.name,
      email: c.email,
      active: c.active !== false,
      categories: (c.categorie_ids as { _id: string; name: string }[]).map((cat) => ({
        _id: cat._id,
        name: cat.name,
      })),
      createdAt: c.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  categorie_ids: z.array(z.string()).default([]),
  force_invalid_email: z.boolean().optional(),
});

// POST — create a company. Email is verified via @el-zazo/email-verifier
// (skippable with force_invalid_email=true for special cases).
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 400 });
  }

  await connectDB();

  const existing = await Company.findOne({ email: parsed.data.email.toLowerCase() });
  if (existing) {
    return NextResponse.json(
      { success: false, error: "Une entreprise avec cet email existe déjà" },
      { status: 400 }
    );
  }

  // Email verification.
  if (!parsed.data.force_invalid_email) {
    try {
      const verifier = new EmailVerifier();
      await verifier.init();
      const result = await verifier.verify(parsed.data.email.toLowerCase());
      if (!result.valid) {
        return NextResponse.json(
          {
            success: false,
            error: `Email non vérifié (${result.reason}). Cochez « forcer » pour ajouter quand même.`,
            email_invalid: true,
          },
          { status: 400 }
        );
      }
    } catch (e) {
      console.error("[COMPANY-EMAIL-VERIFY]", e);
      // Benefit of the doubt on verifier error.
    }
  }

  const company = await Company.create({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    categorie_ids: parsed.data.categorie_ids,
    created_by: auth.user._id,
  });

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "company.create",
    entity_type: "company",
    entity_id: String(company._id),
    details: `Entreprise « ${company.name} » (${company.email}) ajoutée`,
  });

  return NextResponse.json({
    success: true,
    data: { _id: String(company._id), name: company.name, email: company.email },
  });
}

// Helper for categories list (used by the admin UI).
export async function OPTIONS() {
  await connectDB();
  const categories = await Category.find().sort({ name: 1 }).lean();
  return NextResponse.json({
    success: true,
    categories: categories.map((c) => ({ _id: String(c._id), name: c.name })),
  });
}
