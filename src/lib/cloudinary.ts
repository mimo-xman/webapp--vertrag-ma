// Cloudinary PDF upload (raw resource) via REST API with signature.
// Without CLOUDINARY_* env vars (dev preview), returns a mock link and logs a warning.

import crypto from "crypto";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export function cloudinaryEnabled(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

export async function uploadPdfToCloudinary(
  buffer: Buffer,
  originalName: string
): Promise<{ url: string; publicId: string }> {
  if (!cloudinaryEnabled()) {
    const mockId = `vertrag_ma/dossier/mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.warn(
      `[CLOUDINARY:DEV] PDF upload skipped (${originalName}, ${Math.round(buffer.length / 1024)} KB). Returning mock link.`
    );
    return { url: `https://mock-cloudinary.vertrag.ma/${mockId}.pdf`, publicId: mockId };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "vertrag_ma";
  const signature = crypto
    .createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${API_SECRET}`)
    .digest("hex");

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), originalName);
  formData.append("api_key", API_KEY!);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", folder);
  formData.append("signature", signature);
  formData.append("resource_type", "raw");

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary upload error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url, publicId: data.public_id };
}

export function validatePdfFile(file: File, maxMb = 10): string | null {
  if (file.type !== "application/pdf") return "Le fichier doit être un PDF.";
  if (file.size > maxMb * 1024 * 1024) return `Le fichier ne doit pas dépasser ${maxMb} MB.`;
  if (file.size === 0) return "Le fichier est vide.";
  return null;
}
