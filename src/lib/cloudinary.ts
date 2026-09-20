// Cloudinary PDF upload via REST API with signature.
//
// ═══════════════════════════════════════════════════════════════════════════
// IMPORTANT - DISTRIBUTION DES PDF SUR CLOUDINARY (cause racine du 401)
// ═══════════════════════════════════════════════════════════════════════════
// Cloudinary désactive PAR DÉFAUT la distribution des fichiers PDF/ZIP sur les
// comptes (mesure de sécurité). Quand ce réglage est désactivé, TOUT lien PDF
// renvoie HTTP 401 « deny or ACL failure » - quel que soit le mode d'envoi
// (image, raw, auto, URL signée authenticated : tous bloqués, vérifié
// empiriquement). Les images ne sont PAS concernées, d'où l'impression que
// « Cloudinary marche » alors que les PDF échouent.
//
// Le seul fix : activer le réglage dans la console Cloudinary :
//   Console → Settings (engrenage) → Security → « Allow delivery of PDF and
//   ZIP files » → Save    (lien direct : /console/settings/security)
// Aucune modification de code ne peut contourner ce blocage côté compte.
//
// Ce module détecte précisément ce cas et renvoie un message d'erreur
// actionnable (étapes exactes), pour que le problème soit réglable en 30 s.
//
// Sécurité intégrée : après chaque envoi, le lien est VÉRIFIÉ par une requête
// HTTP. Si le fichier n'est pas publiquement accessible, l'asset est détruit
// et une erreur explicite est levée - aucun lien mort n'est persisté en DB.
//
// Configuration (au choix, dans cet ordre) :
//   1. CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
//   2. CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
//      (alias CLOUDINARY_CLOUD_API_KEY / _SECRET et préfixes NEXT_PUBLIC_ OK)

import crypto from "crypto";

// ── Erreurs typées ─────────────────────────────────────────────────────────

export type CloudinaryErrorCode =
  | "not_configured" // variables d'environnement absentes
  | "upload_failed" // l'API Cloudinary a refusé l'envoi
  | "delivery_blocked" // 401 « deny or ACL failure » → réglage du compte
  | "delivery_unreachable"; // lien inaccessible pour une autre raison

export class CloudinaryError extends Error {
  code: CloudinaryErrorCode;
  constructor(code: CloudinaryErrorCode, message: string) {
    super(message);
    this.name = "CloudinaryError";
    this.code = code;
  }
}

/** Étapes exactes pour activer la distribution PDF dans la console Cloudinary. */
export const CLOUDINARY_PDF_DELIVERY_FIX_FR =
  "Cloudinary : la distribution des fichiers PDF est bloquée sur ce compte (HTTP 401 · « deny or ACL failure »).\n\n" +
  "Correction (une seule fois, ~30 secondes) :\n" +
  "1. Ouvrez la console Cloudinary → Paramètres → Sécurité\n" +
  "   (lien direct : https://console.cloudinary.com/settings/security)\n" +
  "2. Activez « Allow delivery of PDF and ZIP files »\n" +
  "3. Cliquez sur Save, puis relancez l'envoi du dossier.\n\n" +
  "Ce réglage est désactivé par défaut sur les comptes Cloudinary récents ; " +
  "aucune modification de code n'est nécessaire après l'avoir activé.";

// ── Configuration ──────────────────────────────────────────────────────────

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

// ── API Cloudinary (REST signé) ────────────────────────────────────────────

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

interface DeliveryCheck {
  ok: boolean;
  status?: number;
  cldError?: string | null;
}

/**
 * Verify that a delivery URL is publicly reachable (HTTP 200, no Cloudinary
 * error header). Tries HEAD first, falls back to a 1-byte ranged GET when
 * HEAD is not supported. Retries once after a short delay. Returns the HTTP
 * status + Cloudinary error header so the caller can produce an actionable
 * error message (e.g. the 401 « deny or ACL failure » account-level block).
 */
async function verifyDeliveryUrl(url: string): Promise<DeliveryCheck> {
  let last: DeliveryCheck = { ok: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const head = await fetch(url, { method: "HEAD", redirect: "follow" });
      const cldError = head.headers.get("x-cld-error");
      if (head.ok && !cldError) return { ok: true, status: head.status };
      if (head.status === 405 || head.status === 501) {
        const ranged = await fetch(url, {
          headers: { Range: "bytes=0-0" },
          redirect: "follow",
        });
        await ranged.body?.cancel().catch(() => {});
        const rangedError = ranged.headers.get("x-cld-error");
        if ((ranged.status === 200 || ranged.status === 206) && !rangedError) {
          return { ok: true, status: ranged.status };
        }
        last = { ok: false, status: ranged.status, cldError: rangedError };
      } else {
        last = { ok: false, status: head.status, cldError };
      }
    } catch {
      last = { ok: false };
    }
  }
  return last;
}

/** 401 « deny or ACL failure » = le réglage compte « Allow delivery of PDF and ZIP files » est désactivé. */
function isPdfDeliveryBlocked(check: DeliveryCheck): boolean {
  if (check.status === 401) return true;
  return /deny or ACL|not allowed|delivery of PDF/i.test(check.cldError ?? "");
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadPdfToCloudinary(
  buffer: Buffer,
  originalName: string
): Promise<{ url: string; publicId: string }> {
  const credentials = readCredentials();
  if (!credentials) {
    throw new CloudinaryError(
      "not_configured",
      "Cloudinary n'est pas configuré. Définissez CLOUDINARY_URL ou CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET dans le .env du serveur, puis redémarrez l'application."
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

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new CloudinaryError(
      "upload_failed",
      `Cloudinary : l'envoi a été refusé (HTTP ${response.status}). ${errorBody.slice(0, 300)}`
    );
  }

  const data = (await response.json()) as { secure_url: string; public_id: string };

  // Never persist a link we cannot reach: verify, and clean up on failure.
  const check = await verifyDeliveryUrl(data.secure_url);
  if (!check.ok) {
    await destroyRawAsset(credentials, data.public_id || publicId);
    if (isPdfDeliveryBlocked(check)) {
      // Cause racine connue et réglable en 30 s depuis la console Cloudinary.
      throw new CloudinaryError("delivery_blocked", CLOUDINARY_PDF_DELIVERY_FIX_FR);
    }
    throw new CloudinaryError(
      "delivery_unreachable",
      `Cloudinary : le PDF a été envoyé mais son lien n'est pas accessible publiquement ` +
        `(HTTP ${check.status ?? "?"}${check.cldError ? ` · ${check.cldError}` : ""}). ` +
        `Le fichier a été supprimé. Lien testé : ${data.secure_url}`
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

// ── Diagnostic admin ───────────────────────────────────────────────────────

/** Minimal valid PDF used by the admin delivery self-test. */
const TEST_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Size 4/Root 1 0 R>>\n%%EOF",
  "utf8"
);

export interface CloudinaryTestResult {
  status: "not_configured" | "ok" | "blocked" | "error";
  message: string;
  /** Tested delivery URL (on success, before cleanup). */
  testedUrl?: string;
}

/**
 * Admin self-diagnostic: uploads a tiny test PDF, verifies its public
 * delivery, then destroys the test asset. Detects the three failure classes:
 * missing configuration, account-level PDF delivery block (actionable steps),
 * and any other error. No leftover asset is kept on Cloudinary.
 */
export async function testCloudinaryPdfDelivery(): Promise<CloudinaryTestResult> {
  const credentials = readCredentials();
  if (!credentials) {
    return {
      status: "not_configured",
      message:
        "Cloudinary n'est pas configuré sur le serveur. Ajoutez CLOUDINARY_CLOUD_NAME, " +
        "CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans le fichier .env, puis redémarrez " +
        "l'application (pm2 restart).",
    };
  }

  try {
    const { url, publicId } = await uploadPdfToCloudinary(TEST_PDF, "test-distribution.pdf");
    // Delivery already verified by the upload itself - clean up the test asset.
    await destroyRawAsset(credentials, publicId);
    return {
      status: "ok",
      message:
        "Cloudinary est opérationnel : le PDF de test a été envoyé, son lien est accessible " +
        "publiquement, puis le fichier de test a été supprimé. Les dossiers peuvent être livrés normalement.",
      testedUrl: url,
    };
  } catch (error) {
    if (error instanceof CloudinaryError) {
      return { status: error.code === "delivery_blocked" ? "blocked" : "error", message: error.message };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Erreur inconnue lors du test Cloudinary.",
    };
  }
}
