// Daily postulation sender — one wave per workflow run.
//
// The wave claims ALL available mail senders (active + not in_use) and runs
// one parallel Execution per sender; each sender processes postulations
// (status en_attente or re_execute, scheduled today or overdue) until the
// queue is empty or the sender fails. Postulations are claimed atomically
// (status → "executing"), so nothing is ever sent twice — even if several
// workflow instances run in parallel.
//
// Every attempt is recorded in the executions collection (one Execution per
// sender), and each postulation embeds the outcome of every execution that
// processed it. If a sender fails (SMTP/API error), it is disabled with the
// error saved — admins fix it, re-activate it and re-test it.
//
// Exit codes: 0 = there may be more postulations to process (re-trigger),
//             1 = nothing left to do (queue drained — expected),
//             2 = fatal error / no mail sender available (fails the CI job,
//                 visible in red in GitHub Actions — never masked as "done").

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";
import { startExecutionWave } from "../src/lib/postulation-executor";

// Safety cap per sender-execution (GitHub Actions jobs are limited to 6 h;
// the self re-trigger pattern drains the rest).
const MAX_PER_SENDER = 5000;

async function main() {
  await connectDB();

  const wave = await startExecutionWave({
    trigger: "github",
    statuses: ["en_attente", "re_execute"],
    dueTodayOnly: true,
    maxPerSender: MAX_PER_SENDER,
  });

  if (wave.postulations_pending === 0) {
    console.log("[SEND] Aucune postulation à traiter aujourd'hui.");
    await disconnectDB();
    process.exit(1); // done — nothing more
  }

  if (wave.execution_ids.length === 0) {
    console.error("[SEND] Postulations en attente mais AUCUN mail sender actif disponible.");
    await disconnectDB();
    process.exit(2);
  }

  console.log(
    `[SEND] ${wave.postulations_pending} postulation(s) à traiter — ${wave.execution_ids.length} exécution(s) parallèle(s) démarrée(s).`
  );
  wave.execution_ids.forEach((id) => console.log(`[SEND]   exécution ${id}`));

  // Wait for every execution of the wave to finish.
  const summary = await wave.promise;

  console.log(
    `[SEND] Vague terminée : ${summary.sent} envoyée(s), ${summary.failed} échouée(s), ` +
      `${summary.senders_used} sender(s) utilisé(s)` +
      (summary.senders_disabled.length > 0
        ? `, désactivé(s) : ${summary.senders_disabled.join(", ")}`
        : "")
  );
  if (summary.fatal_error) console.error(`[SEND] ${summary.fatal_error}`);

  // Re-trigger check: anything left due today after this wave?
  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);
  const remaining = await Postulation.countDocuments({
    status: { $in: ["en_attente", "re_execute"] },
    scheduled_at: { $lte: endOfToday },
  });
  console.log(`[SEND] ${remaining} postulation(s) restante(s) à traiter aujourd'hui.`);

  await disconnectDB();
  process.exit(remaining > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[SEND] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(2);
});
