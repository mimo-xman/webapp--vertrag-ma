// Gate script for the self re-trigger pattern:
// exit 0 = there are due postulations remaining (re-run the workflow),
// exit 1 = queue drained for today.

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";

async function main() {
  await connectDB();

  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);

  const count = await Postulation.countDocuments({
    status: { $in: ["en_attente", "re_execute"] },
    scheduled_at: { $lte: endOfToday },
  });

  console.log(`[CHECK] ${count} postulation(s) restante(s) à traiter aujourd'hui.`);
  await disconnectDB();
  process.exit(count > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[CHECK] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
