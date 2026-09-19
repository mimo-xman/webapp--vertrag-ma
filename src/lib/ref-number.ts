// Aktenzeichen-style reference number generator.
// Kept alias-free (no @/ imports) so it can be shared between the Next.js app
// AND the standalone workflow scripts (workflow/*.ts run via tsx).
//
// Prefixes:
//   P  — demandes de postulation      VT-P-2026-000123
//   DA — demandes d'ajout de dossier  VT-DA-2026-000045
//   DC — demandes de création dossier VT-DC-2026-000067
//   E  — exécutions de workflow       VT-E-2026-000089
//   S  — messages support             VT-S-2026-000012

export type RefPrefix = "P" | "DA" | "DC" | "E" | "S";

export function generateRefNumber(prefix: RefPrefix): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return `VT-${prefix}-${year}-${random}`;
}

/** Detects a MongoDB duplicate-key error (unique index collision). */
export function isDuplicateKeyError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const e = error as { code?: number; message?: string };
    if (e.code === 11000 || e.code === 11001) return true;
    if (typeof e.message === "string" && e.message.includes("E11000")) return true;
  }
  return false;
}

/** Creates a doc with a unique ref number, retrying on rare collisions. */
export async function createWithUniqueRef<T>(
  create: (ref: string) => Promise<T>,
  prefix: RefPrefix,
  attempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await create(generateRefNumber(prefix));
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("Impossible de générer une référence unique");
}
