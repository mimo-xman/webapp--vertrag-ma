// Postulation creation logic, executed when the admin confirms a paid demande.
//
// SNAPSHOT semantics: when the user created his demande, the exact list of
// companies was selected and saved on it (PostulationDemande.company_ids).
// The confirmation creates the postulations from THIS saved list - so a
// company deactivated (or a category disabled) between the creation and the
// confirmation cannot reduce what the user paid for. A company deactivated
// after being snapshotted still receives the postulation: it was selected
// while it was still active.
//
// Legacy demandes created before the snapshot feature have an empty
// company_ids: for those we fall back to a fresh selection of eligible
// companies (active only), as before.
//
// The postulations are spread across days starting tomorrow,
// nmbr_per_day per day.

import mongoose from "mongoose";
import { Postulation } from "@/models/Postulation";
import { Company } from "@/models/Company";
import { Category } from "@/models/Category";

export interface CreatePostulationsResult {
  created: number;
  days: { date: string; count: number }[];
}

export async function createPostulationsForDemande(params: {
  user_id: mongoose.Types.ObjectId;
  demande_id: mongoose.Types.ObjectId;
  categorie_ids: mongoose.Types.ObjectId[];
  company_ids?: mongoose.Types.ObjectId[];
  nmbr_total: number;
  nmbr_per_day: number;
  /** Ref number of the demande - stored on every postulation for origin traceability. */
  demande_ref?: string | null;
}): Promise<CreatePostulationsResult> {
  const {
    user_id,
    demande_id,
    categorie_ids,
    company_ids = [],
    nmbr_total,
    nmbr_per_day,
    demande_ref = null,
  } = params;

  // Companies never used by this user (lifetime anti-duplicate).
  const usedCompanyIds = await Postulation.find({ user_id }).distinct("company_id");
  const usedIds = new Set(usedCompanyIds.map((id: unknown) => String(id)));

  let companies: { _id: mongoose.Types.ObjectId }[];

  if (company_ids.length > 0) {
    // Snapshot mode - the companies were chosen at demande creation time.
    // No `active` filter on purpose (snapshot semantics); companies deleted
    // in the meantime simply drop out and are reported below.
    const snapshotCompanies = await Company.find({ _id: { $in: company_ids } })
      .select("_id")
      .sort({ createdAt: 1 })
      .lean();
    companies = snapshotCompanies as { _id: mongoose.Types.ObjectId }[];

    // Guard against a company having become used between the demande
    // creation and the confirmation (e.g. a postulation manually created by
    // an admin) - it cannot be duplicated (unique index user+company).
    companies = companies.filter((c) => !usedIds.has(String(c._id)));

    if (companies.length < nmbr_total) {
      const missing = nmbr_total - companies.length;
      throw new Error(
        `Incohérence sur la demande : ${missing} entreprise(s) de la sélection d'origine ne sont plus disponibles (supprimées ou déjà utilisées). ` +
          `La demande reste en attente : vérifiez les entreprises concernées puis reconfirmez.`
      );
    }
  } else {
    // Legacy fallback (demande created before the snapshot feature):
    // fresh selection of eligible companies - active companies only, in the
    // selected categories (or all companies belonging to an active category).
    const filter: Record<string, unknown> = {
      active: true,
      _id: { $nin: Array.from(usedIds) },
    };
    if (categorie_ids.length > 0) {
      filter.categorie_ids = { $in: categorie_ids };
    } else {
      const activeCategoryIds = await Category.find({ active: true }).distinct("_id");
      filter.$or = [
        { categorie_ids: { $size: 0 } },
        { categorie_ids: { $in: activeCategoryIds } },
      ];
    }

    companies = (await Company.find(filter)
      .select("_id")
      .sort({ createdAt: 1 })
      .limit(nmbr_total)
      .lean()) as { _id: mongoose.Types.ObjectId }[];

    if (companies.length < nmbr_total) {
      throw new Error(
        `Entreprises disponibles insuffisantes : ${companies.length} trouvées pour ${nmbr_total} demandées.`
      );
    }
  }

  // Spread over days starting tomorrow.
  interface PostulationSeedDoc {
    user_id: mongoose.Types.ObjectId;
    company_id: mongoose.Types.ObjectId;
    demande_id: mongoose.Types.ObjectId;
    demande_ref: string | null;
    created_by_admin: boolean;
    scheduled_at: Date;
    status: "en_attente";
  }
  const docs: PostulationSeedDoc[] = [];
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
      company_id: company._id as mongoose.Types.ObjectId,
      demande_id,
      demande_ref,
      created_by_admin: false, // generated automatically from a confirmed demande
      scheduled_at: new Date(currentDate),
      status: "en_attente",
    });
    countInDay += 1;
  }

  // Group counts per day for the response.
  const perDay = new Map<string, number>();
  for (const doc of docs) {
    const key = doc.scheduled_at.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  for (const [date, count] of perDay) days.push({ date, count });
  days.sort((a, b) => a.date.localeCompare(b.date));

  await Postulation.insertMany(docs);

  return { created: docs.length, days };
}
