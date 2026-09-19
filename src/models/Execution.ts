import mongoose, { Schema } from "mongoose";

// Workflow execution registry.
//
// An Execution = one run of the postulation-sending engine by ONE mail sender
// (parallel executions = one per available mail sender). It embeds the list
// of postulations it processed with their individual outcome, so:
//   execution → many postulations, postulation → many executions (m:n).
//
// Triggers:
//   github — GitHub Actions workflow (cron or manual dispatch)
//   server — backend API route (Oracle Cloud VM, admin "Lancer la relance")
//   admin  — admin executing ONE postulation manually from the postulations page

export type ExecutionTrigger = "github" | "server" | "admin";

export interface ExecutionPostulationEntry {
  postulation_id: mongoose.Types.ObjectId;
  status: "success" | "failed";
  error: string | null;
  executed_at: Date;
}

export interface IExecution extends mongoose.Document {
  ref_number: string;
  trigger: ExecutionTrigger;
  status: "running" | "completed";
  mail_sender_id: mongoose.Types.ObjectId | null;
  mail_sender_name: string;
  total: number;
  success: number;
  failed: number;
  fatal_error: string | null;
  started_at: Date;
  finished_at: Date | null;
  created_by: mongoose.Types.ObjectId | null;
  postulations: ExecutionPostulationEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const ExecutionSchema = new Schema<IExecution>(
  {
    ref_number: { type: String, required: true, unique: true },
    trigger: { type: String, enum: ["github", "server", "admin"], required: true, index: true },
    status: { type: String, enum: ["running", "completed"], default: "running", index: true },
    mail_sender_id: { type: Schema.Types.ObjectId, ref: "MailSender", default: null },
    // Denormalized: survives mail sender deletion, used for display.
    mail_sender_name: { type: String, default: "" },
    total: { type: Number, default: 0 },
    success: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    // Sender-level fatal error (sender disabled) or stale-run timeout.
    fatal_error: { type: String, default: null, maxlength: 1000 },
    started_at: { type: Date, default: Date.now, index: true },
    finished_at: { type: Date, default: null },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    postulations: {
      type: [
        {
          postulation_id: { type: Schema.Types.ObjectId, ref: "Postulation", required: true },
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

export const Execution =
  mongoose.models.Execution || mongoose.model<IExecution>("Execution", ExecutionSchema);
