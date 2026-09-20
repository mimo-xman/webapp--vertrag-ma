import mongoose, { Schema } from "mongoose";

// Status values (per specification, accent-free DB values):
// en_attente | envoyee | echouee | re_execute | executing | annulee_admin
// "executing" is a transient state set while an execution worker is sending
// the email: it guarantees a postulation is never processed twice in parallel
// (atomic findOneAndUpdate claim). Success → envoyee, failure → echouee.
// "annulee_admin" is set when an admin cancels a postulation: it is kept for
// history (never deleted) and never executed by any wave.
export type PostulationStatus =
  | "en_attente"
  | "envoyee"
  | "echouee"
  | "re_execute"
  | "executing"
  | "annulee_admin";

// One entry per execution that processed (or attempted) this postulation.
// A postulation can be executed several times (N1 failed, N2 failed, ... success).
export interface PostulationExecutionEntry {
  execution_id: mongoose.Types.ObjectId;
  status: "success" | "failed";
  error: string | null;
  executed_at: Date;
}

export interface IPostulation extends mongoose.Document {
  user_id: mongoose.Types.ObjectId;
  company_id: mongoose.Types.ObjectId;
  mail_sender_id: mongoose.Types.ObjectId | null;
  demande_id: mongoose.Types.ObjectId | null;
  /** Ref number of the demande that generated this postulation (auto mode). */
  demande_ref: string | null;
  /** Origin: true = created manually by an admin, false = generated
   *  automatically when a paid demande was confirmed. */
  created_by_admin: boolean;
  scheduled_at: Date;
  posted_at: Date | null;
  status: PostulationStatus;
  failed_reason: string | null;
  executions: PostulationExecutionEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const PostulationSchema = new Schema<IPostulation>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    company_id: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    mail_sender_id: { type: Schema.Types.ObjectId, ref: "MailSender", default: null },
    demande_id: { type: Schema.Types.ObjectId, ref: "PostulationDemande", default: null, index: true },
    // Origin traceability - how this postulation came to exist.
    demande_ref: { type: String, default: null, maxlength: 40 },
    created_by_admin: { type: Boolean, default: false },
    scheduled_at: { type: Date, required: true, index: true },
    posted_at: { type: Date, default: null },
    status: {
      type: String,
      enum: ["en_attente", "envoyee", "echouee", "re_execute", "executing", "annulee_admin"],
      default: "en_attente",
      index: true,
    },
    failed_reason: { type: String, default: null },
    executions: {
      type: [
        {
          execution_id: { type: Schema.Types.ObjectId, ref: "Execution", required: true },
          status: { type: String, enum: ["success", "failed"], required: true },
          error: { type: String, default: null },
          executed_at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

// Lifetime anti-duplicate: one user can only postulate once per company.
PostulationSchema.index({ user_id: 1, company_id: 1 }, { unique: true });

export const Postulation =
  mongoose.models.Postulation || mongoose.model<IPostulation>("Postulation", PostulationSchema);
