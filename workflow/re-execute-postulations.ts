// Re-execution worker — MANUAL trigger only (launched from the admin panel
// via the GitHub API, from the Actions tab, or via the server route).
// Processes all postulations with status re_execute, same wave mechanism as
// the daily sender (one parallel execution per available mail sender).
// Failed ones go back to echouee (with the reason recorded).

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";
import { startExecutionWave } from "../src/lib/postulation-executor";

const MAX_PER_SENDER = 5000;

async function main() {
  await connectDB();

  const wave = await startExecutionWave({
    trigger: "github",
    statuses: ["re_execute"],
    dueTodayOnly: false, // relaunch everything marked re_execute
    maxPerSender: MAX_PER_SENDER,
  });

  if (wave.postulations_pending === 0) {
    console.log("[RE-EXECUTE] Aucune postulation à relancer.");
    await disconnectDB();
    process.exit(1);
  }

  if (wave.execution_ids.length === 0) {
    console.error("[RE-EXECUTE] Postulations à relancer mais AUCUN mail sender actif disponible.");
    await disconnectDB();
    process.exit(1);
  }

  console.log(
    `[RE-EXECUTE] ${wave.postulations_pending} postulation(s) à relancer — ${wave.execution_ids.length} exécution(s) parallèle(s) démarrée(s).`
  );
  wave.execution_ids.forEach((id) => console.log(`[RE-EXECUTE]   exécution ${id}`));

  const summary = await wave.promise;

  console.log(
    `[RE-EXECUTE] Vague terminée : ${summary.sent} relancée(s), ${summary.failed} échouée(s)` +
      (summary.senders_disabled.length > 0
        ? `, sender(s) désactivé(s) : ${summary.senders_disabled.join(", ")}`
        : "")
  );
  if (summary.fatal_error) console.error(`[RE-EXECUTE] ${summary.fatal_error}`);

  const remaining = await Postulation.countDocuments({ status: "re_execute" });
  console.log(`[RE-EXECUTE] ${remaining} postulation(s) restante(s) à relancer.`);

  await disconnectDB();
  process.exit(remaining > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[RE-EXECUTE] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
