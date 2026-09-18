// Cloudinary PDF upload via REST API with signature.
//
// PDFs are uploaded as RAW resources (resource_type=raw), delivered at:
//   https://res.cloudinary.com/<cloud>/raw/upload/v<version>/<public_id>.pdf
//
// WHY RAW: Cloudinary blocks PDF delivery through the `image` pipeline on
// some accounts (HTTP 401 "deny or ACL failure" — PDF delivery restriction /
// security scanner). Images still deliver fine, only PDFs are blocked.
// Raw files are served byte-for-byte without that restriction, making
// /raw/upload/ the reliable delivery path for PDFs.
//
// After every upload, the delivery URL is VERIFIED with an HTTP request.
// If the file is not publicly reachable, the asset is destroyed and an
// explicit error is thrown — a broken link is NEVER persisted in the DB.
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

/** Cloudinary signature: sorted params joined as k=v&k=v, + api_secret, sha1. */
function sign(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

/** Best-effort cleanup: delete an uploaded raw asset (e.g. verification failed). */
async function destroyRawAsset(
  credentials: CloudinaryCredentials,
  publicId: string
): Promise<void> {
  const timestamp = String(Math.round(Date.now() / 1000));
  const signature = sign({ public_id: publicId, timestamp }, credentials.apiSecret);
  const formData = new FormData();
  formData.append("api_key", credentials.apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("public_id", publicId);
  await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudName}/raw/destroy`, {
    method: "POST",
    body: formData,
  }).catch(() => {});
}

/**
 * Verify that a delivery URL is publicly reachable (HTTP 200, no Cloudinary
 * error header). Tries HEAD first, falls back to a 1-byte ranged GET when
 * HEAD is not supported. Retries once after a short delay.
 */
async function verifyDeliveryUrl(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const head = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (head.ok && !head.headers.get("x-cld-error")) return true;
      if (head.status === 405 || head.status === 501) {
        const ranged = await fetch(url, {
          headers: { Range: "bytes=0-0" },
          redirect: "follow",
        });
        await ranged.body?.cancel().catch(() => {});
        if (
          (ranged.status === 200 || ranged.status === 206) &&
          !ranged.headers.get("x-cld-error")
        ) {
          return true;
        }
      }
    } catch {
      // network hiccup → retry
    }
  }
  return false;
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
  const timestamp = String(Math.round(Date.now() / 1000));

  // Explicit random public_id with .pdf extension → clean, unique,
  // URL-safe delivery link.
  const publicId = `dossier-${timestamp}-${crypto.randomBytes(5).toString("hex")}.pdf`;
  const signature = sign({ public_id: publicId, timestamp }, apiSecret);

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
    originalName
  );
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("public_id", publicId);

  // RAW upload: PDFs are delivered as-is via /raw/upload/ and are NOT
  // affected by the PDF delivery restriction of the image pipeline.
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary upload error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as { secure_url: string; public_id: string };

  // Never persist a link we cannot reach: verify, and clean up on failure.
  const reachable = await verifyDeliveryUrl(data.secure_url);
  if (!reachable) {
    await destroyRawAsset(credentials, data.public_id || publicId);
    throw new Error(
      `Cloudinary : le PDF a été envoyé mais son lien n'est pas accessible publiquement (${data.secure_url}). ` +
        "Le fichier a été supprimé. Vérifiez dans la console Cloudinary que la distribution de fichiers est autorisée pour ce compte."
    );
  }

  return { url: data.secure_url, publicId: data.public_id };
}

export function validatePdfFile(file: File, maxMb = 10): string | null {
  if (file.type !== "application/pdf") return "Le fichier doit être un PDF.";
  if (file.size > maxMb * 1024 * 1024) return `Le fichier ne doit pas dépasser ${maxMb} MB.`;
  if (file.size === 0) return "Le fichier est vide.";
  return null;
}
