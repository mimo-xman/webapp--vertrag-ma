import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { DossierDemandeForCreate } from "@/models/DossierDemandeForCreate";
import { User } from "@/models/User";
import { logAdminAction } from "@/lib/audit";
import { uploadPdfToCloudinary, validatePdfFile } from "@/lib/cloudinary";

// POST — complete: multipart form with "file" (final dossier PDF) +
// optional traduction_price. Uploads to Cloudinary, saves the link in
// BOTH the demande and the user document, marks completed.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;

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
  if (demande.status !== "payed" && demande.status !== "in_creation") {
    return NextResponse.json(
      { success: false, error: "Le paiement doit être confirmé avant de livrer le dossier." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { url } = await uploadPdfToCloudinary(buffer, file.name);

  demande.status = "completed";
  demande.completed_at = new Date();
  demande.dossier_pdf_link = url;
  if (traductionPrice > 0) demande.traduction_price = traductionPrice;
  await demande.save();

  // The dossier link goes into the user document too.
  await User.findByIdAndUpdate(demande.user_id, { dossier_pdf_link: url });

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
