// Postulation execution engine — the single source of truth for sending
// postulation emails, shared by:
//   - the Next.js app (admin "exécuter" button + "Lancer la relance" server mode)
//   - the GitHub Actions workflow scripts (workflow/send-postulations.ts, …)
//
// IMPORTANT: this module must stay alias-free (relative imports only, no @/
// and no import of lib/mongodb) so the standalone workflow scripts (tsx) can
// import it exactly like the app does. DB connection is expected to be already
// established by the caller.
//
// Execution model:
//   - A "wave" claims ALL available mail senders (active + not in_use) and
//     runs one parallel Execution per sender — each sender processes
//     postulations until the queue is empty or the sender fails.
//   - A postulation is claimed atomically via findOneAndUpdate
//     (status → "executing"), so two executions can NEVER process the same
//     postulation, even across processes / GitHub workflow instances.
//   - When an email send fails because of the SENDER (SMTP/API/auth/quota),
//     the sender is disabled (active: false) with the error saved in
//     last_error, so admins can see the problem, fix it, re-activate and
//     re-test it. Postulation-level failures (missing dossier/company/PDF)
//     do NOT disable the sender.
//   - Every attempt is recorded: Execution.postulations[] embeds the outcome
//     of each postulation, and Postulation.executions[] embeds the outcome of
//     each execution that processed it (m:n).

import type mongoose from "mongoose";
import { Postulation } from "../models/Postulation";
import { MailSender, type IMailSender } from "../models/MailSender";
import { Execution, type IExecution } from "../models/Execution";
import { User } from "../models/User";
import { Company } from "../models/Company";
import { getSettings } from "../models/Setting";
import { sendViaMailSender, textToHtml } from "./mailer-core";
import { createWithUniqueRef } from "./ref-number";

const SEND_DELAY_MS = 400;
// Executions running longer than this are considered dead (crashed worker) —
// they get closed by recoverStuckExecutions() at the next wave start.
const STALE_EXECUTION_MS = 60 * 60 * 1000;
// A postulation stuck in "executing" longer than this is considered abandoned.
const STALE_EXECUTING_MS = 10 * 60 * 1000;

export type ExecutorTrigger = "github" | "server" | "admin";

export interface WaveOptions {
  trigger: ExecutorTrigger;
  /** Which statuses to process. Default: ["en_attente", "re_execute"]. */
  statuses?: Array<"en_attente" | "re_execute">;
  /** Only postulations scheduled today or overdue. Default: true. */
  dueTodayOnly?: boolean;
  /** Safety cap per sender-execution (GitHub 6h job limit). Default: Infinity. */
  maxPerSender?: number;
  /** Admin who started the execution (trigger "admin"/"server"). */
  adminId?: mongoose.Types.ObjectId | string | null;
}

export interface WaveSummary {
  executions: number;
  sent: number;
  failed: number;
  senders_used: number;
  senders_disabled: string[];
  fatal_error: string | null;
}

export interface WaveHandle {
  execution_ids: string[];
  postulations_pending: number;
  /** Resolves when every execution of the wave has finished. */
  promise: Promise<WaveSummary>;
}

export interface SingleExecutionResult {
  execution_id: string;
  ref_number: string;
  status: "success" | "failed";
  error: string | null;
  sender_disabled: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function endOfToday(): Date {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

interface MailContent {
  subject: string;
  html: string;
}

async function loadMailContent(): Promise<MailContent> {
  const settings = await getSettings();
  return {
    subject: settings.postulations.email_subject,
    html: textToHtml(settings.postulations.email_message),
  };
}

interface SendOutcome {
  ok: boolean;
  error: string;
  /** true when the failure is caused by the mail sender itself. */
  senderFailed: boolean;
}

// Sends ONE postulation email. Failures are classified:
//   postulation-level (user/company/PDF missing) → senderFailed: false, keep going
//   sender-level (SMTP/API error)                 → senderFailed: true, disable sender
async function sendOnePostulation(
  sender: IMailSender,
  postulation: { user_id: unknown; company_id: unknown },
  content: MailContent
): Promise<SendOutcome> {
  // 1. User dossier.
  const user = await User.findById(postulation.user_id as mongoose.Types.ObjectId)
    .select("full_name dossier_pdf_link")
    .lean();
  if (!user) return { ok: false, error: "Utilisateur introuvable", senderFailed: false };
  if (!user.dossier_pdf_link) {
    return {
      ok: false,
      error: "Aucun dossier actif pour cet utilisateur (dossier_pdf_link manquant)",
      senderFailed: false,
    };
  }

  // 2. Company email.
  const company = await Company.findById(postulation.company_id as mongoose.Types.ObjectId)
    .select("name email")
    .lean();
  if (!company) return { ok: false, error: "Entreprise introuvable", senderFailed: false };
  if (!company.email) {
    return { ok: false, error: "Entreprise sans adresse email", senderFailed: false };
  }

  // 3. Download the dossier PDF (failure = postulation-level).
  let pdfBuffer: Buffer;
  try {
    const pdfResponse = await fetch(user.dossier_pdf_link);
    if (!pdfResponse.ok) {
      return {
        ok: false,
        error: `Téléchargement du dossier échoué (HTTP ${pdfResponse.status})`,
        senderFailed: false,
      };
    }
    pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  } catch (e) {
    return {
      ok: false,
      error: `Téléchargement du dossier échoué : ${e instanceof Error ? e.message : String(e)}`,
      senderFailed: false,
    };
  }

  // 4. Send email — any failure here is a sender-level problem.
  try {
    await sendViaMailSender(sender, {
      to: company.email,
      subject: content.subject,
      html: content.html,
      attachments: [{ filename: "Bewerbungsunterlagen.pdf", content: pdfBuffer }],
    });
    return { ok: true, error: "", senderFailed: false };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      senderFailed: true,
    };
  }
}

// Records one outcome on BOTH sides of the m:n relation (postulation ↔ execution)
// and updates the sender counters. Written to be resilient: never throws.
async function recordOutcome(params: {
  execution_id: mongoose.Types.ObjectId;
  postulation_id: mongoose.Types.ObjectId;
  sender_id: mongoose.Types.ObjectId;
  outcome: SendOutcome;
}): Promise<void> {
  const { execution_id, postulation_id, sender_id, outcome } = params;
  const now = new Date();
  const error = outcome.error.slice(0, 500);

  try {
    if (outcome.ok) {
      await Promise.all([
        Postulation.findByIdAndUpdate(postulation_id, {
          $set: {
            status: "envoyee",
            posted_at: now,
            mail_sender_id: sender_id,
            failed_reason: null,
          },
          $push: {
            executions: { execution_id, status: "success", executed_at: now },
          },
        }),
        Execution.findByIdAndUpdate(execution_id, {
          $inc: { total: 1, success: 1 },
          $push: {
            postulations: { postulation_id, status: "success", executed_at: now },
          },
        }),
        // usage_count counts actual send attempts; success_count email health.
        MailSender.findByIdAndUpdate(sender_id, { $inc: { usage_count: 1, success_count: 1 } }),
      ]);
    } else {
      await Promise.all([
        Postulation.findByIdAndUpdate(postulation_id, {
          $set: { status: "echouee", failed_reason: error },
          $push: {
            executions: { execution_id, status: "failed", error, executed_at: now },
          },
        }),
        Execution.findByIdAndUpdate(execution_id, {
          $inc: { total: 1, failed: 1 },
          $push: {
            postulations: { postulation_id, status: "failed", error, executed_at: now },
          },
        }),
      ]);
      if (outcome.senderFailed) {
        // Disable the sender so no other execution picks it up until an admin
        // fixes the problem, then re-activates and re-tests it.
        await MailSender.findByIdAndUpdate(sender_id, {
          $set: {
            active: false,
            in_use: false,
            last_error: outcome.error.slice(0, 1000),
            last_error_at: now,
          },
          $inc: { usage_count: 1, failed_count: 1 },
        });
      }
    }
  } catch (e) {
    console.error("[EXECUTOR] Failed to record outcome:", e);
  }
}

// ── Stuck recovery ──────────────────────────────────────────────────────

/**
 * Cleans up crashed/interrupted runs. Must be called before starting a wave:
 *  1. Running executions older than STALE_EXECUTION_MS → completed (timeout).
 *  2. Postulations stuck in "executing" for too long → back to en_attente.
 *  3. Mail senders stuck in_use without a live execution → released.
 */
export async function recoverStuckExecutions(): Promise<void> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_EXECUTION_MS);

  // 1. Close stale running executions.
  const staleExecutions = await Execution.find({
    status: "running",
    started_at: { $lt: staleCutoff },
  })
    .select("_id mail_sender_id")
    .lean();
  if (staleExecutions.length > 0) {
    await Execution.updateMany(
      { _id: { $in: staleExecutions.map((e) => e._id) } },
      {
        $set: {
          status: "completed",
          finished_at: now,
          fatal_error: "Exécution interrompue (timeout) — traitée comme terminée",
        },
      }
    );
  }

  // 2. Reset postulations abandoned in "executing".
  const executingCutoff = new Date(now.getTime() - STALE_EXECUTING_MS);
  const reset = await Postulation.updateMany(
    { status: "executing", updatedAt: { $lt: executingCutoff } },
    { $set: { status: "en_attente" } }
  );
  if (reset.modifiedCount > 0) {
    console.log(`[EXECUTOR] ${reset.modifiedCount} postulation(s) bloquée(s) en "executing" remise(s) en attente.`);
  }

  // 3. Release mail senders not referenced by a live (fresh, running) execution.
  const liveSenderIds = await Execution.find({
    status: "running",
    started_at: { $gte: staleCutoff },
    mail_sender_id: { $ne: null },
  })
    .distinct("mail_sender_id");
  const release = await MailSender.updateMany(
    { in_use: true, _id: { $nin: liveSenderIds } },
    { $set: { in_use: false } }
  );
  if (release.modifiedCount > 0) {
    console.log(`[EXECUTOR] ${release.modifiedCount} mail sender(s) libéré(s) (plus d'exécution active).`);
  }
}

/** Is an execution with this trigger already running (fresh)? */
export async function hasActiveExecution(trigger: ExecutorTrigger): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_EXECUTION_MS);
  const count = await Execution.countDocuments({
    trigger,
    status: "running",
    started_at: { $gte: cutoff },
  });
  return count > 0;
}

// ── Sender-execution worker ─────────────────────────────────────────────

async function runSenderExecution(params: {
  execution: IExecution;
  sender: IMailSender;
  statuses: Array<"en_attente" | "re_execute">;
  dueTodayOnly: boolean;
  maxPerSender: number;
  content: MailContent;
}): Promise<WaveSummary> {
  const { execution, sender, statuses, dueTodayOnly, maxPerSender, content } = params;
  const summary: WaveSummary = {
    executions: 1,
    sent: 0,
    failed: 0,
    senders_used: 1,
    senders_disabled: [],
    fatal_error: null,
  };

  const claimFilter: Record<string, unknown> = { status: { $in: statuses } };
  if (dueTodayOnly) claimFilter.scheduled_at = { $lte: endOfToday() };

  let senderDisabled = false;

  try {
    let processed = 0;
    while (processed < maxPerSender) {
      // Atomic claim — no other execution can take this postulation.
      const postulation = await Postulation.findOneAndUpdate(
        claimFilter,
        { $set: { status: "executing" } },
        { returnDocument: "after", sort: { scheduled_at: 1 } }
      );
      if (!postulation) break;
      processed += 1;

      const tag = `[${String(postulation._id).slice(-6)}]`;
      const outcome = await sendOnePostulation(sender, postulation, content);

      await recordOutcome({
        execution_id: execution._id as mongoose.Types.ObjectId,
        postulation_id: postulation._id as mongoose.Types.ObjectId,
        sender_id: sender._id as mongoose.Types.ObjectId,
        outcome,
      });

      if (outcome.ok) {
        summary.sent += 1;
        console.log(`${tag} ENVOYÉE via ${sender.name} (exécution ${execution.ref_number})`);
      } else {
        summary.failed += 1;
        console.error(`${tag} ÉCHOUÉE — ${outcome.error}`);
        if (outcome.senderFailed) {
          senderDisabled = true;
          summary.senders_disabled.push(sender.name);
          summary.fatal_error = `Mail sender « ${sender.name} » désactivé après échec d'envoi : ${outcome.error.slice(0, 300)}`;
          console.error(`[EXECUTOR] Sender « ${sender.name} » désactivé : ${outcome.error}`);
          break; // stop using this sender
        }
      }

      await delay(SEND_DELAY_MS);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    summary.fatal_error = summary.fatal_error || `Erreur inattendue : ${reason.slice(0, 300)}`;
    console.error(`[EXECUTOR] Fatal error in execution ${execution.ref_number}:`, error);
  } finally {
    // Finalize the execution document + release the sender.
    try {
      await Execution.findByIdAndUpdate(execution._id, {
        $set: {
          status: "completed",
          finished_at: new Date(),
          ...(summary.fatal_error ? { fatal_error: summary.fatal_error.slice(0, 1000) } : {}),
        },
      });
      if (!senderDisabled) {
        await MailSender.findByIdAndUpdate(sender._id, { $set: { in_use: false } });
      } else {
        // Ensure in_use is cleared even if the disable update failed earlier.
        await MailSender.findByIdAndUpdate(
          sender._id,
          { $set: { in_use: false, active: false } }
        );
      }
    } catch (e) {
      console.error("[EXECUTOR] Failed to finalize execution:", e);
    }
  }

  return summary;
}

// ── Wave (all available senders in parallel) ────────────────────────────

/**
 * Starts one execution per available mail sender, all in parallel.
 * Returns immediately with the created execution ids; `handle.promise`
 * resolves when every execution has finished (never rejects).
 *
 * Returns postulations_pending = 0 handle when there is nothing to do,
 * or a handle with a fatal_error when no mail sender is available.
 */
export async function startExecutionWave(opts: WaveOptions): Promise<WaveHandle> {
  await recoverStuckExecutions();

  const statuses = opts.statuses ?? ["en_attente", "re_execute"];
  const dueTodayOnly = opts.dueTodayOnly ?? true;
  const maxPerSender = opts.maxPerSender ?? Infinity;

  const claimFilter: Record<string, unknown> = { status: { $in: statuses } };
  if (dueTodayOnly) claimFilter.scheduled_at = { $lte: endOfToday() };

  const pending = await Postulation.countDocuments(claimFilter);

  const empty: WaveSummary = {
    executions: 0,
    sent: 0,
    failed: 0,
    senders_used: 0,
    senders_disabled: [],
    fatal_error: null,
  };

  if (pending === 0) {
    return { execution_ids: [], postulations_pending: 0, promise: Promise.resolve(empty) };
  }

  // Claim ALL available mail senders (atomic: in_use flag prevents sharing).
  const senders: IMailSender[] = [];
  for (;;) {
    const sender = await MailSender.findOneAndUpdate(
      { active: true, in_use: false },
      { $set: { in_use: true } },
      { returnDocument: "after", sort: { usage_count: 1 } }
    );
    if (!sender) break;
    senders.push(sender);
  }

  if (senders.length === 0) {
    empty.fatal_error = "Aucun mail sender actif disponible — exécution impossible";
    return {
      execution_ids: [],
      postulations_pending: pending,
      promise: Promise.resolve(empty),
    };
  }

  const content = await loadMailContent();
  const executionIds: string[] = [];
  const workers: Promise<WaveSummary>[] = [];

  for (const sender of senders) {
    // Executions are created (and their ids collected) BEFORE returning the
    // handle, so the API can answer with them immediately.
    const execution = await createWithUniqueRef(
      (ref) =>
        Execution.create({
          ref_number: ref,
          trigger: opts.trigger,
          status: "running",
          mail_sender_id: sender._id,
          mail_sender_name: sender.name,
          started_at: new Date(),
          created_by: opts.adminId ?? null,
        }),
      "E"
    );
    executionIds.push(String(execution._id));
    console.log(
      `[EXECUTOR] Exécution ${execution.ref_number} démarrée (${opts.trigger}) avec le sender « ${sender.name} »`
    );

    workers.push(
      runSenderExecution({
        execution,
        sender,
        statuses,
        dueTodayOnly,
        maxPerSender,
        content,
      })
    );
  }

  const promise = (async () => {
    const summaries = await Promise.all(workers);
    return summaries.reduce(
      (acc, s) => ({
        executions: acc.executions + s.executions,
        sent: acc.sent + s.sent,
        failed: acc.failed + s.failed,
        senders_used: acc.senders_used + s.senders_used,
        senders_disabled: [...acc.senders_disabled, ...s.senders_disabled],
        fatal_error: acc.fatal_error || s.fatal_error,
      }),
      { ...empty }
    );
  })();

  return { execution_ids: executionIds, postulations_pending: pending, promise };
}

// ── Single-postulation execution (admin manual) ─────────────────────────

/**
 * Executes exactly ONE postulation with the admin-selected mail sender.
 * Verifies the postulation is not already executing, claims the sender
 * atomically, sends, records everything, and releases the sender.
 * All awaited — returns the full outcome for the admin UI.
 */
export async function executeSinglePostulation(params: {
  postulation_id: string;
  mail_sender_id: string;
  admin_id?: string | null;
}): Promise<SingleExecutionResult> {
  const { postulation_id, mail_sender_id, admin_id } = params;

  // 1. The postulation must exist and be executable (not already executing).
  const postulation = await Postulation.findById(postulation_id).lean();
  if (!postulation) {
    throw new Error("Postulation introuvable");
  }
  if (!["en_attente", "re_execute"].includes(postulation.status)) {
    throw new Error(
      postulation.status === "executing"
        ? "Cette postulation est déjà en cours d'exécution"
        : `Cette postulation n'est pas exécutable (statut actuel : ${postulation.status})`
    );
  }

  // 2. Atomically claim the chosen mail sender.
  const sender = await MailSender.findOneAndUpdate(
    { _id: mail_sender_id, active: true, in_use: false },
    { $set: { in_use: true } },
    { returnDocument: "after" }
  );
  if (!sender) {
    throw new Error(
      "Mail sender indisponible (inactif, introuvable ou déjà utilisé par une exécution en cours)"
    );
  }

  let execution: IExecution | null = null;
  try {
    // 3. Claim the postulation (guards against a concurrent execution).
    const claimed = await Postulation.findOneAndUpdate(
      { _id: postulation_id, status: { $in: ["en_attente", "re_execute"] } },
      { $set: { status: "executing" } },
      { returnDocument: "after" }
    );
    if (!claimed) {
      await MailSender.findByIdAndUpdate(sender._id, { $set: { in_use: false } });
      throw new Error("Cette postulation vient d'être prise en charge par une autre exécution");
    }

    // 4. Create the execution document (one postulation).
    const createdExecution = await createWithUniqueRef(
      (ref) =>
        Execution.create({
          ref_number: ref,
          trigger: "admin",
          status: "running",
          mail_sender_id: sender!._id,
          mail_sender_name: sender!.name,
          started_at: new Date(),
          created_by: admin_id ?? null,
        }),
      "E"
    );
    execution = createdExecution;

    // 5. Send.
    const content = await loadMailContent();
    const outcome = await sendOnePostulation(sender, claimed, content);
    await recordOutcome({
      execution_id: createdExecution._id as mongoose.Types.ObjectId,
      postulation_id: claimed._id as mongoose.Types.ObjectId,
      sender_id: sender._id as mongoose.Types.ObjectId,
      outcome,
    });

    const result: SingleExecutionResult = {
      execution_id: String(createdExecution._id),
      ref_number: createdExecution.ref_number,
      status: outcome.ok ? "success" : "failed",
      error: outcome.ok ? null : outcome.error,
      sender_disabled: outcome.senderFailed,
    };

    // 6. Finalize the execution + release the sender.
    await Execution.findByIdAndUpdate(createdExecution._id, {
      $set: {
        status: "completed",
        finished_at: new Date(),
        ...(outcome.senderFailed
          ? {
              fatal_error: `Mail sender « ${sender.name} » désactivé après échec d'envoi : ${outcome.error.slice(0, 300)}`,
            }
          : {}),
      },
    });
    if (!outcome.senderFailed) {
      await MailSender.findByIdAndUpdate(sender._id, { $set: { in_use: false } });
    }

    return result;
  } catch (error) {
    // Cleanup: release the claimed sender and close the execution on failure.
    await MailSender.findByIdAndUpdate(sender._id, { $set: { in_use: false } }).catch(() => {});
    if (execution) {
      await Execution.findByIdAndUpdate(execution._id, {
        $set: {
          status: "completed",
          finished_at: new Date(),
          fatal_error: `Erreur : ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`,
        },
      }).catch(() => {});
    }
    throw error;
  }
}
