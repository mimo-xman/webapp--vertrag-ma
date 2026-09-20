import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/models/Setting";
import { Category } from "@/models/Category";
import { Company } from "@/models/Company";
import { Postulation } from "@/models/Postulation";
import { User } from "@/models/User";
import { buildEligibleCompanyFilter } from "@/lib/company-eligibility";
import {
  buildTotalOptions,
  buildPerDayOptions,
  computePrice,
  normalizePricing,
  validateDemandeInput,
} from "@/lib/pricing";

// GET /api/postulation-demandes/options?categories=id1,id2
// Dynamic: eligible companies count (active + not already used by this user),
// total/per-day options, price preview. Deactivated categories are hidden
// from the selector; deactivated companies (and companies whose categories
// are ALL deactivated, in "all companies" mode) are excluded from the count.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();
  const pricing = normalizePricing(settings.postulation_pricing);

  const categoriesParam = request.nextUrl.searchParams.get("categories") || "";
  const categoryIds = categoriesParam
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id && mongoose.isValidObjectId(id));

  const user = await User.findById(auth.user._id).select("dossier_pdf_link").lean();
  const hasDossier = Boolean(user?.dossier_pdf_link);

  // Companies eligible = active, in selected categories (or all), minus
  // companies this user has ALREADY applied to (lifetime anti-duplicate).
  const usedCompanyIds = await Postulation.find({ user_id: auth.user._id }).distinct("company_id");

  // Defensive: keep only categories that still exist AND are active.
  let selectedObjectIds: mongoose.Types.ObjectId[] = [];
  if (categoryIds.length > 0) {
    const activeSelected = await Category.find({
      _id: { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) },
      active: true,
    })
      .select("_id")
      .lean();
    selectedObjectIds = activeSelected.map((c) => c._id as mongoose.Types.ObjectId);
  }

  const filter = await buildEligibleCompanyFilter({
    usedCompanyIds,
    categoryIds: selectedObjectIds,
  });
  const available = await Company.countDocuments(filter);

  // Selector: only ACTIVE categories, with their eligible company count.
  const categories = await Category.find({ active: true }).sort({ name: 1 }).select("_id name").lean();
  const categoriesWithCount = await Promise.all(
    categories.map(async (cat) => {
      const count = await Company.countDocuments({
        active: true,
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
    pricing,
    preview,
  });
}

// POST /api/postulation-demandes/options - validate + price a specific selection.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const settings = await getSettings();
  const pricing = normalizePricing(settings.postulation_pricing);

  const body = (await request.json().catch(() => ({}))) as {
    categorie_ids?: string[];
    nmbr_total?: number;
    nmbr_per_day?: number;
  };

  const categoryIds = (body.categorie_ids || []).filter(Boolean);
  const nmbrTotal = Number(body.nmbr_total || 0);
  const nmbrPerDay = Number(body.nmbr_per_day || 0);

  const usedCompanyIds = await Postulation.find({ user_id: auth.user._id }).distinct("company_id");

  // Defensive: keep only categories that still exist AND are active.
  let selectedObjectIds: mongoose.Types.ObjectId[] = [];
  if (categoryIds.length > 0) {
    const activeSelected = await Category.find({
      _id: { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) },
      active: true,
    })
      .select("_id")
      .lean();
    selectedObjectIds = activeSelected.map((c) => c._id as mongoose.Types.ObjectId);
  }

  const filter = await buildEligibleCompanyFilter({
    usedCompanyIds,
    categoryIds: selectedObjectIds,
  });
  const available = await Company.countDocuments(filter);

  const validationError = validateDemandeInput(nmbrTotal, nmbrPerDay, available, pricing);
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  const breakdown = computePrice(nmbrTotal, nmbrPerDay, pricing);
  return NextResponse.json({ success: true, breakdown });
}
