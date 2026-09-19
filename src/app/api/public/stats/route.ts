import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Company } from "@/models/Company";
import { Postulation } from "@/models/Postulation";
import { getSettings } from "@/models/Setting";
import { DEFAULT_PRICING } from "@/lib/pricing";

// Public, non-sensitive counters + live pricing for the home page.
// The pricing block mirrors the admin settings: when an admin changes the
// prices, the home page reflects it immediately (no hardcoded values).
// The companies counter only counts ACTIVE companies — those targetable by
// a new demande de postulation (deactivated ones are excluded).
export async function GET() {
  try {
    await connectDB();
    const [companies, sent, settings] = await Promise.all([
      Company.countDocuments({ active: true }),
      Postulation.countDocuments({ status: "envoyee" }),
      getSettings(),
    ]);

    const pricing = { ...DEFAULT_PRICING, ...settings.postulation_demandes };

    return NextResponse.json({
      success: true,
      companies,
      sent,
      pricing: {
        price_of_hundred_total: pricing.price_of_hundred_total,
        price_of_hundred_per_day: pricing.price_of_hundred_per_day,
        free_per_day_amount: pricing.free_per_day_amount,
        min_total: pricing.min_total,
        min_per_day: pricing.min_per_day,
        step_total: pricing.step_total,
        step_per_day: pricing.step_per_day,
      },
      dossier: {
        creation_price: settings.dossier.creation_price,
        add_price: settings.dossier.add_price,
      },
    });
  } catch {
    // Fallback to code defaults so the home page still renders prices.
    return NextResponse.json({
      success: true,
      companies: 0,
      sent: 0,
      pricing: DEFAULT_PRICING,
      dossier: { creation_price: 20, add_price: 0 },
    });
  }
}
