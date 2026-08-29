import mongoose, { Schema } from "mongoose";

// Status values (per specification, accent-free DB values):
// en_attente | envoyee | echouee | re_execute
export type PostulationStatus = "en_attente" | "envoyee" | "echouee" | "re_execute";

export interface IPostulation extends mongoose.Document {
  user_id: mongoose.Types.ObjectId;
  company_id: mongoose.Types.ObjectId;
  mail_sender_id: mongoose.Types.ObjectId | null;
  demande_id: mongoose.Types.ObjectId | null;
  scheduled_at: Date;
  posted_at: Date | null;
  status: PostulationStatus;
  failed_reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PostulationSchema = new Schema<IPostulation>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    company_id: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    mail_sender_id: { type: Schema.Types.ObjectId, ref: "MailSender", default: null },
    demande_id: { type: Schema.Types.ObjectId, ref: "PostulationDemande", default: null, index: true },
    scheduled_at: { type: Date, required: true, index: true },
    posted_at: { type: Date, default: null },
    status: {
      type: String,
      enum: ["en_attente", "envoyee", "echouee", "re_execute"],
      default: "en_attente",
      index: true,
    },
    failed_reason: { type: String, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

// Lifetime anti-duplicate: one user can only postulate once per company.
PostulationSchema.index({ user_id: 1, company_id: 1 }, { unique: true });

export const Postulation =
  mongoose.models.Postulation || mongoose.model<IPostulation>("Postulation", PostulationSchema);
