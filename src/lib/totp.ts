// TOTP helpers - thin adapter over oplib v13 functional API.
// otplib v13 removed the legacy `authenticator` object; the new API is:
//   generateSecret() / generateSync({ secret }) / verifySync({ secret, token })
//   generateURI({ issuer, label, secret })
// All 2FA routes go through this module so the API surface stays in one place.

import { generateSecret, generateSync, generateURI, verifySync } from "otplib";

/** Generate a new Base32 TOTP secret. */
export function createTotpSecret(): string {
  return generateSecret();
}

/** Build the otpauth:// URI scanned by authenticator apps. */
export function buildTotpUri(label: string, issuer: string, secret: string): string {
  return generateURI({ issuer, label, secret });
}

/** Compute the current 6-digit TOTP token for a secret (server-side checks). */
export function currentTotpToken(secret: string): string {
  return generateSync({ secret });
}

/**
 * Verify a TOTP token (or 8-char backup code handled elsewhere) against a secret.
 * Never throws: malformed tokens simply return false.
 */
export function verifyTotp(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  try {
    const result = verifySync({ secret, token: token.replace(/\s+/g, "") });
    return Boolean(result && result.valid);
  } catch {
    return false;
  }
}
