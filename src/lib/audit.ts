// Admin action audit logging - write-only from the app, consultable by all admins.

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

// Aktenzeichen-style reference numbers - shared implementation in ref-number.ts
// (kept alias-free so the workflow scripts can use it too).
export { generateRefNumber } from "./ref-number";
