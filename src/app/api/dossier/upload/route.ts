import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { User } from "@/models/User";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { uploadPdfToCloudinary, validatePdfFile } from "@/lib/cloudinary";
import { generateRefNumber } from "@/lib/audit";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// POST /api/dossier/upload — multipart form with "file" (PDF).
// Uploads to Cloudinary, creates a "demande d'ajout" with status en_attente.
export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "dossier-upload", 5, 15 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop d'envois. Réessayez plus tard." },
        { status: 429, headers: rateLimitHeaders(rl, 5) }
      );
    }

    const auth = await requireAuth(request);
    if ("error" in auth) return auth.error;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "Fichier manquant" }, { status: 400 });
    }

    // PDF validation: type + size (10 MB max).
    const validationError = validatePdfFile(file, 10);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    await connectDB();

    // Cannot have two pending add-demandes.
    const pending = await DossierDemandeForAdd.findOne({
      user_id: auth.user._id,
      status: "en_attente",
    });
    if (pending) {
      return NextResponse.json(
        { success: false, error: "Vous avez déjà une demande d'ajout en attente de vérification." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadPdfToCloudinary(buffer, file.name);

    const demande = await DossierDemandeForAdd.create({
      ref_number: generateRefNumber("DA"),
      user_id: auth.user._id,
      dossier_pdf_link: url,
      status: "en_attente",
    });

    return NextResponse.json({
      success: true,
      message: "Dossier envoyé ! En attente de vérification par l'équipe.",
      demande: { _id: String(demande._id), ref_number: demande.ref_number },
    });
  } catch (error) {
    console.error("[DOSSIER-UPLOAD]", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de l'envoi du dossier" },
      { status: 500 }
    );
  }
}
