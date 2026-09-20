// Gate script for the self re-trigger pattern:
// exit 0 = there are due postulations remaining (re-run the workflow),
// exit 1 = queue drained for today, OR no mail sender has capacity left
//          today (all limited / none active) - re-running now would be an
//          infinite loop, so the wave stops until tomorrow.
// exit 2 = fatal error (fails the CI job - never masked as "drained").
//
// Optional argument: a specific status to check (default: en_attente + re_execute).

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";
import { MailSender } from "../src/models/MailSender";

/** True when at least one ACTIVE sender can still send today
 *  (no limit, or limit not reached yet, counting the UTC day). */
async function senderWithCapacityToday(): Promise<boolean> {
  const senders = await MailSender.find({ active: true })
    .select("daily_limit usage_log")
    .lean();
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const start = startOfToday.getTime();

  return senders.some((s) => {
    const limit = s.daily_limit || 0;
    if (limit === 0) return true; // unlimited
    const used = (s.usage_log || []).filter(
      (at) => new Date(at as Date).getTime() >= start
    ).length;
    return used < limit;
  });
}

async function main() {
  const statusArg = process.argv[2];
  const statuses: string[] =
    statusArg === "re_execute" ? ["re_execute"] : ["en_attente", "re_execute"];

  await connectDB();

  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);

  const count = await Postulation.countDocuments({
    status: { $in: statuses },
    scheduled_at: { $lte: endOfToday },
  });

  if (count === 0) {
    console.log(`[CHECK] ${count} postulation(s) restante(s) (${statuses.join(", ")}).`);
    await disconnectDB();
    process.exit(1); // drained
  }

  // Work remains - but can any sender still send today? Without this guard
  // the self re-trigger pattern would loop forever when every sender is at
  // its daily limit or disabled.
  const hasCapacity = await senderWithCapacityToday();
  if (!hasCapacity) {
    console.log(
      `[CHECK] ${count} postulation(s) restante(s), mais aucun service email actif n'a de capacité restante aujourd'hui (limite quotidienne atteinte ou aucun sender actif) : arrêt des relances automatiques jusqu'à demain.`
    );
    await disconnectDB();
    process.exit(1); // nothing more can be done today
  }

  console.log(`[CHECK] ${count} postulation(s) restante(s) (${statuses.join(", ")}).`);
  await disconnectDB();
  process.exit(0); // more to process : re-trigger
}

main().catch(async (error) => {
  console.error("[CHECK] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(2);
});
