// Postulation creation logic, executed when the admin confirms a paid demande.
// Takes N eligible companies (selected categories or all), excluding companies
// the user has already applied to (lifetime), and spreads the postulations
// across days starting tomorrow, nmbr_per_day per day.

import mongoose from "mongoose";
import { Postulation } from "@/models/Postulation";
import { Company } from "@/models/Company";

export interface CreatePostulationsResult {
  created: number;
  days: { date: string; count: number }[];
}

export async function createPostulationsForDemande(params: {
  user_id: mongoose.Types.ObjectId;
  demande_id: mongoose.Types.ObjectId;
  categorie_ids: mongoose.Types.ObjectId[];
  nmbr_total: number;
  nmbr_per_day: number;
}): Promise<CreatePostulationsResult> {
  const { user_id, demande_id, categorie_ids, nmbr_total, nmbr_per_day } = params;

  // Companies never used by this user (lifetime anti-duplicate), in the
  // selected categories (or all companies if no category selected).
  const usedCompanyIds = await Postulation.find({ user_id }).distinct("company_id");
  const usedIds = usedCompanyIds.map((id) => id.toString());

  const filter: Record<string, unknown> = { _id: { $nin: usedIds } };
  if (categorie_ids.length > 0) {
    filter.categorie_ids = { $in: categorie_ids };
  }

  const companies = await Company.find(filter)
    .select("_id")
    .sort({ createdAt: 1 })
    .limit(nmbr_total)
    .lean();

  if (companies.length < nmbr_total) {
    throw new Error(
      `Entreprises disponibles insuffisantes : ${companies.length} trouvées pour ${nmbr_total} demandées.`
    );
  }

  // Spread over days starting tomorrow.
  const docs: mongoose.RootFilterQuery<never>[] = [];
  const days: { date: string; count: number }[] = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);

  let dayIndex = 0;
  let countInDay = 0;
  let currentDate = new Date(start);

  for (const company of companies) {
    if (countInDay >= nmbr_per_day) {
      dayIndex += 1;
      countInDay = 0;
      currentDate = new Date(start);
      currentDate.setUTCDate(currentDate.getUTCDate() + dayIndex);
    }
    docs.push({
      user_id,
      company_id: company._id,
      demande_id,
      scheduled_at: new Date(currentDate),
      status: "en_attente",
    });
    countInDay += 1;
  }

  // Group counts per day for the response.
  const perDay = new Map<string, number>();
  for (const doc of docs) {
    const d = doc as unknown as { scheduled_at: Date };
    const key = d.scheduled_at.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  for (const [date, count] of perDay) days.push({ date, count });
  days.sort((a, b) => a.date.localeCompare(b.date));

  await Postulation.insertMany(docs);

  return { created: docs.length, days };
}
