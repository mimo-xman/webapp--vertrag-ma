import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";
import { CloudinaryError, uploadPdfToCloudinary, validatePdfFile } from "@/lib/cloudinary";

// POST — complete: multipart form with "file" (final dossier PDF) +
// optional traduction_price. Uploads to Cloudinary, saves the link in
// BOTH the demande and the user document, marks completed.
// A completed demande can be re-delivered (PDF replacement).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await handleComplete(request, (await params).id);
  } catch (error) {
    // Surface the real cause with the exact fix steps (e.g. Cloudinary
    // account blocks PDF delivery) as a clean JSON error for the admin UI.
    console.error("[DOSSIER-COMPLETE]", error);
    const message =
      error instanceof CloudinaryError
        ? error.message
        : "Erreur lors de la livraison du dossier";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function handleComplete(request: NextRequest, id: string) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const traductionPrice = Number(formData.get("traduction_price") || 0);

  if (!file) {
    return NextResponse.json({ success: false, error: "Fichier PDF manquant" }, { status: 400 });
  }
  const validationError = validatePdfFile(file, 20);
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  await connectDB();
  const demande = await DossierDemandeForCreate.findById(id);
  if (!demande) {
    return NextResponse.json({ success: false, error: "Demande introuvable" }, { status: 404 });
  }
  // First delivery requires a confirmed payment. A COMPLETED demande can be
  // re-delivered (PDF replacement) — useful when the previous link is broken.
  const isReplacement = demande.status === "completed";
  if (!["payed", "in_creation", "completed"].includes(demande.status)) {
    return NextResponse.json(
      { success: false, error: "Le paiement doit être confirmé avant de livrer le dossier." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { url } = await uploadPdfToCloudinary(buffer, file.name);

  demande.status = "completed";
  if (!demande.completed_at) demande.completed_at = new Date();
  demande.dossier_pdf_link = url;
  if (traductionPrice > 0) demande.traduction_price = traductionPrice;
  demande.active = false;
  await demande.save();

  if (isReplacement) {
    // Refresh the user's active dossier link ONLY if this demande is still
    // its current source (another demande may have become the active dossier).
    await User.updateOne(
      { _id: demande.user_id, dossier_source_demande_id: demande._id },
      { $set: { dossier_pdf_link: url } }
    );
  } else {
    // The dossier link goes into the user document too with source info.
    await User.findByIdAndUpdate(demande.user_id, {
      dossier_pdf_link: url,
      dossier_source_type: "creation",
      dossier_source_demande_id: demande._id,
      dossier_source_ref_number: demande.ref_number,
    });
  }

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "dossier_create.complete",
    entity_type: "dossier_demande_for_create",
    entity_id: id,
    details: `Dossier livré pour ${demande.ref_number}${traductionPrice > 0 ? ` (traduction : ${traductionPrice} $)` : ""}`,
  });

  return NextResponse.json({ success: true, message: "Dossier livré" });
}
