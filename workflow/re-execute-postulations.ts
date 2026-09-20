// Re-execution worker - MANUAL trigger only (launched from the admin panel
// via the GitHub API, from the Actions tab, or via the server route).
// Processes postulations with status re_execute, same wave mechanism as
// the daily sender (one parallel execution per available mail sender).
// Failed ones go back to echouee (with the reason recorded).
//
// Scheduling window: only postulations scheduled TODAY or in the PAST are
// relaunched (scheduled_at <= end of today) - never future ones. When the
// admin selected a date interval in the panel, DATE_FROM / DATE_TO env
// vars (workflow_dispatch inputs, YYYY-MM-DD) narrow it further.
//
// Exit codes: 0 = more re_execute postulations remain (re-trigger),
//             1 = nothing left to relaunch (expected),
//             2 = fatal error / no mail sender available (fails the CI job).

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";
import { startExecutionWave } from "../src/lib/postulation-executor";

const MAX_PER_SENDER = 5000;

/** Parses a YYYY-MM-DD env var into a UTC Date (+ endOfDayMs), or null. */
function parseEnvDate(value: string | undefined, endOfDayMs: number): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() + endOfDayMs);
}

async function main() {
  await connectDB();

  const from = parseEnvDate(process.env.DATE_FROM, 0);
  const to = parseEnvDate(process.env.DATE_TO, 86_399_999);
  if (from && to && from.getTime() > to.getTime()) {
    console.error("[RE-EXECUTE] DATE_FROM doit être antérieure ou égale à DATE_TO.");
    await disconnectDB();
    process.exit(2);
  }

  const hasInterval = Boolean(from || to);
  if (hasInterval) {
    console.log(
      `[RE-EXECUTE] Intervalle sélectionné : ${process.env.DATE_FROM || "…"} → ${process.env.DATE_TO || "…"} (UTC).`
    );
  }

  const wave = await startExecutionWave({
    trigger: "github",
    statuses: ["re_execute"],
    // Explicit interval overrides; default = today or overdue only.
    scheduledFrom: from ?? undefined,
    scheduledTo: to ?? undefined,
    dueTodayOnly: !hasInterval,
    maxPerSender: MAX_PER_SENDER,
  });

  if (wave.postulations_pending === 0) {
    console.log("[RE-EXECUTE] Aucune postulation à relancer (aujourd'hui ou passée).");
    await disconnectDB();
    process.exit(1);
  }

  if (wave.execution_ids.length === 0) {
    console.error("[RE-EXECUTE] Postulations à relancer mais AUCUN mail sender actif disponible.");
    await disconnectDB();
    process.exit(2);
  }

  console.log(
    `[RE-EXECUTE] ${wave.postulations_pending} postulation(s) à relancer · ${wave.execution_ids.length} exécution(s) parallèle(s) démarrée(s).`
  );
  wave.execution_ids.forEach((id) => console.log(`[RE-EXECUTE]   exécution ${id}`));

  const summary = await wave.promise;

  console.log(
    `[RE-EXECUTE] Vague terminée : ${summary.sent} relancée(s), ${summary.failed} échouée(s)` +
      (summary.senders_disabled.length > 0
        ? `, sender(s) désactivé(s) : ${summary.senders_disabled.join(", ")}`
        : "") +
      (summary.senders_limited.length > 0
        ? `, limite quotidienne atteinte : ${summary.senders_limited.join(", ")}`
        : "")
  );
  if (summary.fatal_error) console.error(`[RE-EXECUTE] ${summary.fatal_error}`);

  const windowFilter: Record<string, unknown> = { status: "re_execute" };
  if (hasInterval) {
    windowFilter.scheduled_at = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  } else {
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    windowFilter.scheduled_at = { $lte: endOfToday };
  }
  const remaining = await Postulation.countDocuments(windowFilter);
  console.log(`[RE-EXECUTE] ${remaining} postulation(s) restante(s) à relancer.`);

  await disconnectDB();
  process.exit(remaining > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[RE-EXECUTE] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(2);
});
