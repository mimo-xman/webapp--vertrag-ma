import mongoose, { Schema } from "mongoose";

export interface IAuditLog extends mongoose.Document {
  admin_id: mongoose.Types.ObjectId;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    admin_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    admin_email: { type: String, required: true },
    action: { type: String, required: true, index: true },
    entity_type: { type: String, required: true, index: true },
    entity_id: { type: String, default: null },
    details: { type: String, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
