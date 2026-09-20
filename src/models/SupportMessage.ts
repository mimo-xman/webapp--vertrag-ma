import mongoose, { Schema } from "mongoose";

// Support messages - sent from the public /contact page.
// Each message carries a unique reference id the user can quote when
// communicating with the team. Admins view them in Admin → Messages and
// toggle them between "active" and "closed":
//   closed = the team contacted the user by email and the issue is resolved.

export type SupportMessageStatus = "active" | "closed";

// Reasons shown in the contact form select.
export const SUPPORT_REASONS = [
  "account_suspended",
  "postulations",
  "dossier",
  "payment",
  "other",
] as const;
export type SupportReason = (typeof SUPPORT_REASONS)[number];

export interface ISupportMessage extends mongoose.Document {
  ref_id: string;
  user_id: mongoose.Types.ObjectId | null;
  full_name: string;
  email: string;
  reason: string;
  message: string;
  status: SupportMessageStatus;
  closed_at: Date | null;
  closed_by: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const SupportMessageSchema = new Schema<ISupportMessage>(
  {
    ref_id: { type: String, required: true, unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    full_name: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    reason: { type: String, required: true, maxlength: 60 },
    message: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },
    status: { type: String, enum: ["active", "closed"], default: "active", index: true },
    closed_at: { type: Date, default: null },
    closed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const SupportMessage =
  mongoose.models.SupportMessage ||
  mongoose.model<ISupportMessage>("SupportMessage", SupportMessageSchema);
