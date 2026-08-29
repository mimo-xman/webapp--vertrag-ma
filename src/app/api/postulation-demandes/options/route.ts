import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/models/Setting";
import { Category } from "@/models/Category";
import { Company } from "@/models/Company";
import { Postulation } from "@/models/Postulation";
import { User } from "@/models/User";
import {
  buildTotalOptions,
  buildPerDayOptions,
  computePrice,
  DEFAULT_PRICING,
  validateDemandeInput,
} from "@/lib/pricing";

// GET /api/postulation-demandes/options?categories=id1,id2
// Dynamic: companies count (minus already-used by this user), total/per-day options, price preview.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();
  const pricing = {
    ...DEFAULT_PRICING,
    ...settings.postulation_demandes,
  };

  const categoriesParam = request.nextUrl.searchParams.get("categories") || "";
  const categoryIds = categoriesParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const user = await User.findById(auth.user._id).select("dossier_pdf_link").lean();
  const hasDossier = Boolean(user?.dossier_pdf_link);

  // Companies eligible = in selected categories (or all), minus companies this
  // user has ALREADY applied to (lifetime anti-duplicate).
  const usedCompanyIds = await Postulation.find({ user_id: auth.user._id }).distinct("company_id");

  const filter: Record<string, unknown> = { _id: { $nin: usedCompanyIds } };
  if (categoryIds.length > 0) {
    filter.categorie_ids = { $in: categoryIds };
  }
  const available = await Company.countDocuments(filter);

  const categories = await Category.find().sort({ name: 1 }).select("name").lean();
  // Count available companies per category for display.
  const categoriesWithCount = await Promise.all(
    categories.map(async (cat) => {
      const count = await Company.countDocuments({
        _id: { $nin: usedCompanyIds },
        categorie_ids: cat._id,
      });
      return { _id: String(cat._id), name: cat.name, companies_available: count };
    })
  );

  const totalOptions = buildTotalOptions(available, pricing);
  const perDayOptions = buildPerDayOptions(
    totalOptions.length ? Math.max(...totalOptions) : available,
    pricing
  );

  // Price preview for default selection (min values).
  const defaultTotal = totalOptions[0] || 0;
  const defaultPerDay = perDayOptions[0] || 0;
  const preview =
    defaultTotal > 0 && defaultPerDay > 0
      ? computePrice(defaultTotal, defaultPerDay, pricing)
      : null;

  return NextResponse.json({
    success: true,
    has_dossier: hasDossier,
    companies_available: available,
    categories: categoriesWithCount,
    total_options: totalOptions,
    per_day_options: perDayOptions,
    pricing: {
      price_of_hundred_total: pricing.price_of_hundred_total,
      price_of_hundred_per_day: pricing.price_of_hundred_per_day,
      free_per_day_amount: pricing.free_per_day_amount,
      min_total: pricing.min_total,
      min_per_day: pricing.min_per_day,
    },
    preview,
  });
}

// POST /api/postulation-demandes/options — validate + price a specific selection.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();
  const pricing = { ...DEFAULT_PRICING, ...settings.postulation_demandes };

  const body = (await request.json().catch(() => ({}))) as {
    categorie_ids?: string[];
    nmbr_total?: number;
    nmbr_per_day?: number;
  };

  const categoryIds = (body.categorie_ids || []).filter(Boolean);
  const nmbrTotal = Number(body.nmbr_total || 0);
  const nmbrPerDay = Number(body.nmbr_per_day || 0);

  const usedCompanyIds = await Postulation.find({ user_id: auth.user._id }).distinct("company_id");
  const filter: Record<string, unknown> = { _id: { $nin: usedCompanyIds } };
  if (categoryIds.length > 0) filter.categorie_ids = { $in: categoryIds };
  const available = await Company.countDocuments(filter);

  const validationError = validateDemandeInput(nmbrTotal, nmbrPerDay, available, pricing);
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  const breakdown = computePrice(nmbrTotal, nmbrPerDay, pricing);
  return NextResponse.json({ success: true, breakdown });
}
