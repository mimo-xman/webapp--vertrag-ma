import mongoose, { Schema } from "mongoose";

export interface IMailSender extends mongoose.Document {
  name: string;
  type: "api" | "smtp";
  api_key: string | null;
  smtp_config: {
    host: string;
    port: number;
    username: string;
    password: string;
  } | null;
  active: boolean;
  usage_count: number;
  success_count: number;
  failed_count: number;
  createdAt: Date;
  updatedAt: Date;
}

const MailSenderSchema = new Schema<IMailSender>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    type: { type: String, enum: ["api", "smtp"], required: true },
    api_key: { type: String, default: null },
    smtp_config: {
      host: { type: String, default: "" },
      port: { type: Number, default: 587 },
      username: { type: String, default: "" },
      password: { type: String, default: "" },
    },
    active: { type: Boolean, default: true },
    usage_count: { type: Number, default: 0, index: true },
    success_count: { type: Number, default: 0 },
    failed_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

export const MailSender =
  mongoose.models.MailSender || mongoose.model<IMailSender>("MailSender", MailSenderSchema);
