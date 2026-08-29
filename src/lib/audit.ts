// Admin action audit logging — write-only from the app, consultable by all admins.

import { AuditLog } from "@/models/AuditLog";
import type mongoose from "mongoose";

export async function logAdminAction(params: {
  admin_id: mongoose.Types.ObjectId | string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: string | null;
}): Promise<void> {
  try {
    await AuditLog.create({
      admin_id: params.admin_id,
      admin_email: params.admin_email,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      details: params.details ?? null,
    });
  } catch (error) {
    console.error("[AUDIT] Failed to log action:", error);
  }
}

// Aktenzeichen-style reference numbers: VT-P-000123, VT-DA-000045, VT-DC-000067
export function generateRefNumber(prefix: "P" | "DA" | "DC"): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return `VT-${prefix}-${year}-${random}`;
}
