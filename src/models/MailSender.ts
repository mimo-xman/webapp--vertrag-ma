import mongoose, { Schema } from "mongoose";

export interface IMailSender extends mongoose.Document {
  name: string;
  type: "api" | "smtp";
  sender_email: string | null;
  api_key: string | null;
  smtp_config: {
    host: string;
    port: number;
    username: string;
    password: string;
  } | null;
  active: boolean;
  in_use: boolean;
  last_error: string | null;
  last_error_at: Date | null;
  usage_count: number;
  success_count: number;
  failed_count: number;
  /** Max sends per day (UTC day). 0 = unlimited. */
  daily_limit: number;
  /** Timestamps of every real send attempt, recorded IMMEDIATELY when the
   *  sender is used (never batched after the end of a wave, so a crash can
   *  never lose usage history). Capped to the last 5000 entries. */
  usage_log: Date[];
  createdAt: Date;
  updatedAt: Date;
}

const MailSenderSchema = new Schema<IMailSender>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    type: { type: String, enum: ["api", "smtp"], required: true },
    // Brevo requires an explicit sender email address on the account.
    sender_email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v: string | null) => v === null || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: "Adresse email expéditeur invalide",
      },
    },
    api_key: { type: String, default: null },
    smtp_config: {
      host: { type: String, default: "" },
      port: { type: Number, default: 587 },
      username: { type: String, default: "" },
      password: { type: String, default: "" },
    },
    active: { type: Boolean, default: true },
    // Atomic claim flag: set to true while an execution is using this sender,
    // so parallel executions never share the same mail sender.
    in_use: { type: Boolean, default: false, index: true },
    // Last send failure - filled when a send fails so the sender is disabled;
    // admins read it, fix the problem, then re-activate + re-test the sender.
    last_error: { type: String, default: null, maxlength: 1000 },
    last_error_at: { type: Date, default: null },
    usage_count: { type: Number, default: 0, index: true },
    success_count: { type: Number, default: 0 },
    failed_count: { type: Number, default: 0 },
    // Provider quota guard: when > 0, an execution stops using this sender
    // for the rest of the UTC day once the limit is reached.
    daily_limit: { type: Number, default: 0, min: 0 },
    usage_log: { type: [Date], default: [] },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const MailSender =
  mongoose.models.MailSender || mongoose.model<IMailSender>("MailSender", MailSenderSchema);
