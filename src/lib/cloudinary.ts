// Cloudinary PDF upload via REST API with signature.
//
// Uploads PDFs through the `image` resource type (Cloudinary handles PDFs as
// image assets), producing delivery URLs of the form:
//   https://res.cloudinary.com/<cloud>/image/upload/v<version>/<random_id>.pdf
//
// Configuration (any of the following, checked in order):
//   1. CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
//   2. CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
//      (aliases with _CLOUD_ / NEXT_PUBLIC_ prefixes are also accepted)
//
// Without configuration the upload FAILS with a clear error — never a fake
// link — so no broken URL can be persisted in the database.

import crypto from "crypto";

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function readCredentials(): CloudinaryCredentials | null {
  // 1. Standard CLOUDINARY_URL format
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (cloudinaryUrl) {
    try {
      const parsed = new URL(cloudinaryUrl);
      const apiKey = decodeURIComponent(parsed.username || "");
      const apiSecret = decodeURIComponent(parsed.password || "");
      const cloudName = parsed.hostname || "";
      if (apiKey && apiSecret && cloudName) return { cloudName, apiKey, apiSecret };
    } catch {
      console.error("[CLOUDINARY] Invalid CLOUDINARY_URL format");
    }
  }

  // 2. Separate variables (with alias support)
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey =
    process.env.CLOUDINARY_API_KEY ||
    process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY ||
    process.env.CLOUDINARY_CLOUD_API_KEY;
  const apiSecret =
    process.env.CLOUDINARY_API_SECRET ||
    process.env.NEXT_PUBLIC_CLOUDINARY_API_SECRET ||
    process.env.CLOUDINARY_CLOUD_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret };
  }
  return null;
}

export function cloudinaryEnabled(): boolean {
  return readCredentials() !== null;
}

export async function uploadPdfToCloudinary(
  buffer: Buffer,
  originalName: string
): Promise<{ url: string; publicId: string }> {
  const credentials = readCredentials();
  if (!credentials) {
    throw new Error(
      "Cloudinary n'est pas configuré. Définissez CLOUDINARY_URL ou CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET."
    );
  }

  const { cloudName, apiKey, apiSecret } = credentials;
  const timestamp = Math.round(Date.now() / 1000);

  // Signature without a folder: Cloudinary assigns a random public_id,
  // exactly like the standard unsigned delivery URLs.
  const signature = crypto
    .createHash("sha1")
    .update(`timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
    originalName
  );
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);

  // PDFs are uploaded via the `image` resource type so the delivery URL is
  // https://res.cloudinary.com/<cloud>/image/upload/... (consistent with the
  // links already shared with users).
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
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
