import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/models/Setting";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { generateRefNumber } from "@/lib/audit";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// POST /api/dossier/request-creation — user requests the paid dossier creation (20 $ default).
export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "dossier-create-req", 5, 15 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop de demandes. Réessayez plus tard." },
        { status: 429, headers: rateLimitHeaders(rl, 5) }
      );
    }

    const auth = await requireAuth(request);
    if ("error" in auth) return auth.error;

    await connectDB();
    const settings = await getSettings();

    // Only one active creation demande at a time.
    const active = await DossierDemandeForCreate.findOne({
      user_id: auth.user._id,
      status: { $in: ["en_attente", "payed"] },
    });
    if (active) {
      return NextResponse.json(
        { success: false, error: "Vous avez déjà une demande de création en cours." },
        { status: 400 }
      );
    }

    const demande = await DossierDemandeForCreate.create({
      ref_number: generateRefNumber("DC"),
      user_id: auth.user._id,
      price: settings.dossier.creation_price,
      traduction_price: 0,
      status: "en_attente",
    });

    return NextResponse.json({
      success: true,
      message: "Demande de création enregistrée !",
      demande: {
        _id: String(demande._id),
        ref_number: demande.ref_number,
        price: demande.price,
      },
      whatsapp_url: settings.contact.whatsapp_url,
    });
  } catch (error) {
    console.error("[DOSSIER-CREATE-REQ]", error);
    return NextResponse.json({ success: false, error: "Erreur" }, { status: 500 });
  }
}
