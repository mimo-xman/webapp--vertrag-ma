// Imports the test dataset into the database:
//   seed/categories.json - 1 000 categories
//   seed/companies.json  - 20 000 companies (test emails)
// Also aligns the pricing settings with the new minimum (500 → 100).
//
// Usage (from the repo root or the workflow/ folder):
//   cd workflow && npm install
//   MONGO_URI="mongodb://..." MONGO_DB_NAME="vertrag_ma" npx tsx seed-data.ts
//
// Idempotent: re-running skips documents that already exist (matching by
// unique key: category name, company email) instead of crashing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB, disconnectDB } from "./db";
import mongoose from "mongoose";
import { Category } from "../src/models/Category";
import { Company } from "../src/models/Company";
import { User } from "../src/models/User";
import { getSettings } from "../src/models/Setting";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface RawId {
  $oid: string;
}

interface RawCategory {
  _id: RawId;
  name: string;
}

interface RawCompany {
  name: string;
  email: string;
  categorie_ids: RawId[];
  created_by: RawId;
}

function loadJson<T>(file: string): T[] {
  const raw = readFileSync(join(ROOT, "seed", file), "utf-8");
  return JSON.parse(raw) as T[];
}

async function main() {
  await connectDB();

  // ── Categories ───────────────────────────────────────────────────────
  const rawCategories = loadJson<RawCategory>("categories.json");
  console.log(`[SEED] ${rawCategories.length} catégories à importer…`);

  const existingCategoryIds = new Set(
    (await Category.find().select("_id").lean()).map((c) => String(c._id))
  );
  const categoryDocs = rawCategories
    .filter((c) => !existingCategoryIds.has(c._id.$oid))
    .map((c) => ({
      _id: new mongoose.Types.ObjectId(c._id.$oid),
      name: c.name,
    }));
  if (categoryDocs.length > 0) {
    await Category.insertMany(categoryDocs, { ordered: false }).catch((err) => {
      // Duplicate names (unique index) are skipped, the rest must pass.
      if (!`${err.message}`.includes("E11000")) throw err;
    });
  }
  const totalCategories = await Category.countDocuments();
  console.log(`[SEED] Catégories en base : ${totalCategories}`);

  // ── Companies ────────────────────────────────────────────────────────
  const rawCompanies = loadJson<RawCompany>("companies.json");
  console.log(`[SEED] ${rawCompanies.length} entreprises à importer…`);

  const existingCompanyEmails = new Set(
    (await Company.find().select("email").lean()).map((c) => c.email)
  );
  const companyDocs = rawCompanies
    .filter((c) => !existingCompanyEmails.has(c.email))
    .map((c) => ({
      name: c.name,
      email: c.email,
      categorie_ids: c.categorie_ids.map((id) => new mongoose.Types.ObjectId(id.$oid)),
      created_by: new mongoose.Types.ObjectId(c.created_by.$oid),
    }));
  if (companyDocs.length > 0) {
    // Batches of 5 000 - insertMany with ordered:false tolerates duplicates.
    const BATCH = 5000;
    for (let i = 0; i < companyDocs.length; i += BATCH) {
      const batch = companyDocs.slice(i, i + BATCH);
      await Company.insertMany(batch, { ordered: false }).catch((err) => {
        if (!`${err.message}`.includes("E11000")) throw err;
      });
      console.log(`[SEED]   ${Math.min(i + BATCH, companyDocs.length)}/${companyDocs.length} traitées…`);
    }
  }
  const totalCompanies = await Company.countDocuments();
  console.log(`[SEED] Entreprises en base : ${totalCompanies}`);

  // ── creator user sanity check ────────────────────────────────────────
  const creator = await User.findById("6aa9c627d566c8aa115e2468").select("email").lean();
  console.log(
    creator
      ? `[SEED] created_by → ${creator.email}`
      : `[SEED] ⚠ l'utilisateur 6aa9c627d566c8aa115e2468 n'existe pas encore (created_by restera une référence pendante : créez le compte admin correspondant ou importez-le).`
  );

  // ── Align pricing settings with the new minimum (500 → 100) ──────────
  const settings = await getSettings();
  const pp = settings.postulation_pricing;
  let changed = false;
  if (pp.total.min > 100) {
    console.log(`[SEED] Minimum total : ${pp.total.min} → 100.`);
    pp.total.min = 100;
    changed = true;
  }
  if (pp.per_day.min > 100) {
    // Must stay <= min_total, otherwise a 100-total demande has no per-day option.
    console.log(`[SEED] Minimum par jour : ${pp.per_day.min} → 100.`);
    pp.per_day.min = 100;
    changed = true;
  }
  if (changed) await settings.save();

  await disconnectDB();
  console.log("[SEED] Terminé ✔");
  process.exit(0);
}

main().catch(async (error) => {
  console.error("[SEED] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
