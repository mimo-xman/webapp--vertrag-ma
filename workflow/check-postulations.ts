// Gate script for the self re-trigger pattern:
// exit 0 = there are due postulations remaining (re-run the workflow),
// exit 1 = queue drained for today.
//
// Optional argument: a specific status to check (default: en_attente + re_execute).

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";

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

  console.log(`[CHECK] ${count} postulation(s) restante(s) (${statuses.join(", ")}).`);
  await disconnectDB();
  process.exit(count > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[CHECK] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
