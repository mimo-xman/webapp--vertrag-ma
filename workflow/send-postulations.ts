// Daily postulation sender - one wave per workflow run.
//
// The wave claims ALL available mail senders (active + not in_use) and runs
// one parallel Execution per sender; each sender processes postulations
// (status en_attente or re_execute, scheduled today or overdue) until the
// queue is empty or the sender fails. Postulations are claimed atomically
// (status → "executing"), so nothing is ever sent twice - even if several
// workflow instances run in parallel.
//
// Optional DATE_FROM / DATE_TO env (workflow_dispatch inputs from the admin
// panel's "Lancer l'exécution"): restrict the scheduling window, like the
// relance interval. Both bounds are capped at TODAY - the future is never
// executed. When unset, the default window is "today or overdue".
//
// Every attempt is recorded in the executions collection (one Execution per
// sender), and each postulation embeds the outcome of every execution that
// processed it. If a sender fails (SMTP/API error), it is disabled with the
// error saved - admins fix it, re-activate it and re-test it.
//
// Exit codes: 0 = there may be more postulations to process (re-trigger),
//             1 = nothing left to do (queue drained - expected),
//             2 = fatal error / no mail sender available (fails the CI job,
//                 visible in red in GitHub Actions - never masked as "done").

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";
import { startExecutionWave } from "../src/lib/postulation-executor";

// Safety cap per sender-execution (GitHub Actions jobs are limited to 6 h;
// the self re-trigger pattern drains the rest).
const MAX_PER_SENDER = 5000;

/** Parses a YYYY-MM-DD env value into a Date (UTC midnight + endOfDayMs).
 *  Returns null for missing/invalid values (default window applies). */
function parseEnvDate(value: string | undefined, endOfDayMs: number): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + endOfDayMs);
}

async function main() {
  await connectDB();

  // Optional interval from the workflow_dispatch inputs (admin panel).
  const from = parseEnvDate(process.env.DATE_FROM, 0);
  const to = parseEnvDate(process.env.DATE_TO, 86_399_999);
  if (from && to && from.getTime() > to.getTime()) {
    console.error("[SEND] DATE_FROM doit être antérieure ou égale à DATE_TO.");
    await disconnectDB();
    process.exit(2);
  }
  // The future is never executed: both bounds are capped at today.
  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);
  if ((from && from.getTime() > endOfToday.getTime()) || (to && to.getTime() > endOfToday.getTime())) {
    console.error("[SEND] DATE_FROM / DATE_TO ne peuvent pas dépasser la date du jour.");
    await disconnectDB();
    process.exit(2);
  }
  if (from || to) {
    console.log(
      `[SEND] Intervalle sélectionné : ${process.env.DATE_FROM || "…"} → ${process.env.DATE_TO || "…"} (UTC).`
    );
  }

  const wave = await startExecutionWave({
    trigger: "github",
    statuses: ["en_attente", "re_execute"],
    scheduledFrom: from ?? undefined,
    scheduledTo: to ?? undefined,
    dueTodayOnly: !from && !to, // default window: today or overdue only
    maxPerSender: MAX_PER_SENDER,
  });

  if (wave.postulations_pending === 0) {
    console.log("[SEND] Aucune postulation à traiter aujourd'hui.");
    await disconnectDB();
    process.exit(1); // done : nothing more
  }

  if (wave.execution_ids.length === 0) {
    console.error("[SEND] Postulations en attente mais AUCUN mail sender actif disponible.");
    await disconnectDB();
    process.exit(2);
  }

  console.log(
    `[SEND] ${wave.postulations_pending} postulation(s) à traiter · ${wave.execution_ids.length} exécution(s) parallèle(s) démarrée(s).`
  );
  wave.execution_ids.forEach((id) => console.log(`[SEND]   exécution ${id}`));

  // Wait for every execution of the wave to finish.
  const summary = await wave.promise;

  console.log(
    `[SEND] Vague terminée : ${summary.sent} envoyée(s), ${summary.failed} échouée(s), ` +
      `${summary.senders_used} sender(s) utilisé(s)` +
      (summary.senders_disabled.length > 0
        ? `, désactivé(s) : ${summary.senders_disabled.join(", ")}`
        : "") +
      (summary.senders_limited.length > 0
        ? `, limite quotidienne atteinte : ${summary.senders_limited.join(", ")} (les postulations restantes restent en attente)`
        : "")
  );
  if (summary.fatal_error) console.error(`[SEND] ${summary.fatal_error}`);

  // Re-trigger check: anything left in the SAME window after this wave?
  const remainingFilter: Record<string, unknown> = {
    status: { $in: ["en_attente", "re_execute"] },
  };
  if (from || to) {
    remainingFilter.scheduled_at = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  } else {
    remainingFilter.scheduled_at = { $lte: endOfToday };
  }
  const remaining = await Postulation.countDocuments(remainingFilter);
  console.log(`[SEND] ${remaining} postulation(s) restante(s) à traiter dans la fenêtre.`);

  await disconnectDB();
  process.exit(remaining > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[SEND] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(2);
});
