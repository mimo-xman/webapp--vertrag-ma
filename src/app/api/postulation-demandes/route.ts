import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/models/Setting";
import { PostulationDemande } from "@/models/PostulationDemande";
import { Company } from "@/models/Company";
import { Postulation } from "@/models/Postulation";
import { User } from "@/models/User";
import {
  DEFAULT_PRICING,
  computePrice,
  validateDemandeInput,
} from "@/lib/pricing";
import { generateRefNumber } from "@/lib/audit";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// GET — user's demandes history.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Math.max(5, Number(params.get("limit") || 10)));
  const status = params.get("status");
  const sortField = params.get("sort") || "createdAt";
  const sortOrder = params.get("order") === "asc" ? 1 : -1;
  const allowedSorts = ["createdAt", "nmbr_total", "price", "status"];
  const sort: Record<string, 1 | -1> = {
    [allowedSorts.includes(sortField) ? sortField : "createdAt"]: sortOrder,
  };

  const filter: Record<string, unknown> = { user_id: auth.user._id };
  if (status && status !== "all") filter.status = status;

  const [items, total] = await Promise.all([
    PostulationDemande.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
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
      status: d.status,
      confirmed_at: d.confirmed_at,
      createdAt: d.createdAt,
      categories: (d.categorie_ids as { name: string }[]).map((c) => c.name),
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

// POST — create a new demande (requires active dossier, no pending demande).
export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "create-demande", 10, 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop de requêtes" },
        { status: 429, headers: rateLimitHeaders(rl, 10) }
      );
    }

    const auth = await requireAuth(request);
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as {
      categorie_ids?: string[];
      nmbr_total?: number;
      nmbr_per_day?: number;
    };

    await connectDB();

    // Preconditions.
    const user = await User.findById(auth.user._id);
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!user.dossier_pdf_link) {
      return NextResponse.json(
        { success: false, error: "Un dossier actif est requis pour créer une demande." },
        { status: 400 }
      );
    }
    const pendingExists = await PostulationDemande.findOne({
      user_id: user._id,
      status: "en_attente",
    });
    if (pendingExists) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Vous avez déjà une demande en attente. Annulez-la ou attendez sa confirmation.",
        },
        { status: 400 }
      );
    }

    const settings = await getSettings();
    const pricing = { ...DEFAULT_PRICING, ...settings.postulation_demandes };

    const categoryIds = (body.categorie_ids || []).filter(Boolean);
    const nmbrTotal = Number(body.nmbr_total || 0);
    const nmbrPerDay = Number(body.nmbr_per_day || 0);

    // Validate against real availability (excluding already-used companies).
    const usedCompanyIds = await Postulation.find({ user_id: user._id }).distinct("company_id");
    const filter: Record<string, unknown> = { _id: { $nin: usedCompanyIds } };
    if (categoryIds.length > 0) {
      filter.categorie_ids = { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }
    const available = await Company.countDocuments(filter);

    const validationError = validateDemandeInput(nmbrTotal, nmbrPerDay, available, pricing);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const breakdown = computePrice(nmbrTotal, nmbrPerDay, pricing);

    const demande = await PostulationDemande.create({
      ref_number: generateRefNumber("P"),
      user_id: user._id,
      categorie_ids: categoryIds,
      nmbr_total: nmbrTotal,
      nmbr_per_day: nmbrPerDay,
      price: breakdown.final_price,
      status: "en_attente",
    });

    return NextResponse.json({
      success: true,
      demande: {
        _id: String(demande._id),
        ref_number: demande.ref_number,
        price: demande.price,
        breakdown,
      },
      whatsapp_url: settings.contact.whatsapp_url,
    });
  } catch (error) {
    console.error("[CREATE-DEMANDE]", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création de la demande" },
      { status: 500 }
    );
  }
}
