// Demo data seeding — runs automatically when the in-memory dev database
// is used (no MONGODB_URI configured). Gives a fully working preview with
// realistic German companies, categories, users and activity.
// Idempotent: each collection is only seeded when empty.

import { User } from "@/models/User";
import { Category } from "@/models/Category";
import { Company } from "@/models/Company";
import { Postulation } from "@/models/Postulation";
import { PostulationDemande } from "@/models/PostulationDemande";
import { DossierDemandeForAdd } from "@/models/DossierDemandeForAdd";
import { MailSender } from "@/models/MailSender";
import { getSettings } from "@/models/Setting";
import { hashPassword } from "./auth";

const CATEGORIES = [
  "Santé",
  "Informatique",
  "BTP & Construction",
  "Industrie & Production",
  "Commerce & Retail",
  "Hôtellerie & Restauration",
  "Logistique & Transport",
  "Énergie & Environnement",
];

const REAL_COMPANIES: { name: string; email: string; cats: number[] }[] = [
  { name: "Charité Berlin", email: "bewerbung@charite.de", cats: [0] },
  { name: "Universitätsklinik Heidelberg", email: "karriere@klinikum-heidelberg.de", cats: [0] },
  { name: "Asklepios Kliniken", email: "jobs@asklepios.com", cats: [0] },
  { name: "Helios Kliniken GmbH", email: "bewerbungen@helios-gesundheit.de", cats: [0] },
  { name: "SAP SE", email: "careers@sap.com", cats: [1] },
  { name: "Siemens AG", email: "jobs@siemens.com", cats: [1, 3] },
  { name: "Deutsche Telekom IT", email: "bewerbung@telekom-it.de", cats: [1] },
  { name: "Zalando SE", email: "karriere@zalando.de", cats: [1, 4] },
  { name: "Software AG", email: "jobs@softwareag.com", cats: [1] },
  { name: "DATEV eG", email: "bewerbung@datev.de", cats: [1] },
  { name: "Hochtief AG", email: "karriere@hochtief.de", cats: [2] },
  { name: "STRABAG SE", email: "jobs@strabag.de", cats: [2] },
  { name: "Bilfinger SE", email: "bewerbung@bilfinger.com", cats: [2, 3] },
  { name: "Züblin AG", email: "karriere@zueblin.de", cats: [2] },
  { name: "Bosch GmbH", email: "jobs@bosch.de", cats: [3] },
  { name: "Continental AG", email: "bewerbung@continental-corporation.com", cats: [3] },
  { name: "ThyssenKrupp AG", email: "karriere@thyssenkrupp.com", cats: [3] },
  { name: "Volkswagen AG", email: "jobs@volkswagen.de", cats: [3] },
  { name: "BMW Group", email: "bewerbung@bmwgroup.com", cats: [3] },
  { name: "Mercedes-Benz AG", email: "karriere@mercedes-benz.com", cats: [3] },
  { name: "Lidl & Schwarz KG", email: "bewerbung@lidl.de", cats: [4] },
  { name: "Aldi Süd", email: "karriere@aldi-sued.de", cats: [4] },
  { name: "Rewe Group", email: "jobs@rewe.de", cats: [4] },
  { name: "dm-drogerie markt", email: "bewerbung@dm.de", cats: [4] },
  { name: "IKEA Deutschland", email: "karriere@ikea.de", cats: [4] },
  { name: "Deutsche Hospitality", email: "jobs@steigenberger.com", cats: [5] },
  { name: "Motel One GmbH", email: "bewerbung@motel-one.com", cats: [5] },
  { name: "Aida Cruises", email: "karriere@aida.de", cats: [5] },
  { name: "Rocco Forte Hotels", email: "jobs@roccofortehotels.de", cats: [5] },
  { name: "DHL Group", email: "bewerbung@dhl.com", cats: [6] },
  { name: "DB Schenker", email: "karriere@dbschenker.com", cats: [6] },
  { name: "Hermes Germany", email: "jobs@hermesworld.de", cats: [6] },
  { name: "Rhenus Logistics", email: "bewerbung@rhenus.de", cats: [6] },
  { name: "RWE AG", email: "karriere@rwe.com", cats: [7] },
  { name: "E.ON SE", email: "jobs@eon.com", cats: [7] },
  { name: "EnBW Energie", email: "bewerbung@enbw.com", cats: [7] },
  { name: "Siemens Gamesa", email: "careers@siemensgamesa.com", cats: [7, 3] },
  { name: "Fraunhofer Gesellschaft", email: "jobs@fraunhofer.de", cats: [1, 7] },
  { name: "BASF SE", email: "bewerbung@basf.com", cats: [3, 7] },
  { name: "Bayer AG", email: "karriere@bayer.de", cats: [0, 3] },
  { name: "Adidas AG", email: "jobs@adidas-group.com", cats: [4] },
  { name: "Puma SE", email: "bewerbung@puma.com", cats: [4] },
  { name: "Daimler Truck", email: "karriere@daimlertruck.com", cats: [3] },
  { name: "Knorr-Bremse AG", email: "jobs@knorr-bremse.com", cats: [3, 6] },
  { name: "Fresenius Medical Care", email: "bewerbung@fresenius.de", cats: [0] },
  { name: "Dr. Oetker", email: "karriere@oetker.de", cats: [4] },
  { name: "Paul Hartmann AG", email: "jobs@hartmann.info", cats: [0, 3] },
  { name: "Würth Group", email: "bewerbung@wuerth.de", cats: [4, 3] },
  { name: "Schwarz Dienstleistung", email: "karriere@schwarz.de", cats: [4, 6] },
  { name: "Kärcher SE", email: "jobs@kaercher.com", cats: [3] },
];

// Synthetic German company generator (Mittelstand style).
const SURNAMES = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann", "Schmid", "Schulz", "Maier", "Köhler", "Herrmann", "Walter", "Peters", "Kaiser", "Fuchs", "Lang", "Weiß", "Jung"];
const SECTORS = [
  { word: "Bau", cats: [2] },
  { word: "IT Solutions", cats: [1] },
  { word: "Logistik", cats: [6] },
  { word: "Handel", cats: [4] },
  { word: "Industrie", cats: [3] },
  { word: "Pflege", cats: [0] },
  { word: "Gastronomie", cats: [5] },
  { word: "Energie", cats: [7] },
  { word: "Technik", cats: [3] },
  { word: "Services", cats: [1, 4] },
];
const CITIES = ["München", "Hamburg", "Köln", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Bremen", "Dresden", "Nürnberg", "Essen", "Mannheim", "Hannover", "Bonn", "Münster", "Karlsruhe", "Augsburg", "Wiesbaden", "Kiel"];
const EMAIL_PREFIXES = ["bewerbung", "karriere", "jobs", "personal", "recruiting"];
const FORMS = ["GmbH", "GmbH & Co. KG", "AG", "SE"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}

function generateCompanies(count: number): { name: string; email: string; cats: number[] }[] {
  const companies: { name: string; email: string; cats: number[] }[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (companies.length < count && i < count * 3) {
    // Independent digits via division → 40 × 10 × 20 × 4 = 32 000 unique combos.
    const surname = SURNAMES[i % SURNAMES.length];
    const sector = SECTORS[Math.floor(i / 40) % SECTORS.length];
    const city = CITIES[Math.floor(i / 400) % CITIES.length];
    const form = FORMS[Math.floor(i / 8000) % FORMS.length];
    const name = `${surname} ${sector.word} ${city} ${form}`;
    const slug = slugify(name);
    if (!seen.has(slug)) {
      seen.add(slug);
      const prefix = EMAIL_PREFIXES[i % EMAIL_PREFIXES.length];
      companies.push({
        name,
        email: `${prefix}@${slug}.de`,
        cats: sector.cats,
      });
    }
    i++;
  }
  return companies;
}

export async function seedIfEmpty(): Promise<void> {
  // Settings singleton (always ensure).
  await getSettings();

  // ── Categories ─────────────────────────────────────────────
  if ((await Category.countDocuments()) === 0) {
    await Category.insertMany(CATEGORIES.map((name) => ({ name })));
    console.log(`[SEED] ${CATEGORIES.length} catégories créées`);
  }
  const categories = await Category.find().lean();

  // ── Companies (50 real + ~1100 synthetic Mittelstand) ─────
  if ((await Company.countDocuments()) === 0) {
    const synthetic = generateCompanies(1100);
    const all = [...REAL_COMPANIES, ...synthetic];
    await Company.insertMany(
      all.map((c) => ({
        name: c.name,
        email: c.email,
        categorie_ids: c.cats.map((i) => categories[i]._id),
      }))
    );
    console.log(`[SEED] ${all.length} entreprises créées`);
  }

  // ── Users ──────────────────────────────────────────────────
  const passwordHash = await hashPassword("Demo1234!");
  let admin = await User.findOne({ email: "admin@vertrag.ma" });
  if (!admin) {
    admin = await User.create({
      full_name: "Équipe Vertrag",
      email: "admin@vertrag.ma",
      password: passwordHash,
      role: "admin",
      active: true,
      date_of_birth: new Date("1990-01-01"),
    });
    console.log("[SEED] admin@vertrag.ma créé (mdp: Demo1234!)");
  }

  let user = await User.findOne({ email: "user@vertrag.ma" });
  if (!user) {
    user = await User.create({
      full_name: "Yassine El Amrani",
      email: "user@vertrag.ma",
      password: passwordHash,
      role: "user",
      active: true,
      date_of_birth: new Date("1996-05-14"),
      dossier_pdf_link:
        "https://mock-cloudinary.vertrag.ma/vertrag_ma/dossier/demo-user-dossier.pdf",
    });
    console.log("[SEED] user@vertrag.ma créé (mdp: Demo1234!)");
  }

  let user2 = await User.findOne({ email: "salma@vertrag.ma" });
  if (!user2) {
    user2 = await User.create({
      full_name: "Salma Bennani",
      email: "salma@vertrag.ma",
      password: passwordHash,
      role: "user",
      active: true,
    });
  }

  // ── Mail senders (mock configs for the preview) ────────────
  if ((await MailSender.countDocuments()) === 0) {
    await MailSender.insertMany([
      {
        name: "Brevo Principal",
        type: "api",
        sender_email: "bewerbung@vertrag.ma",
        api_key: "xkeysib-mock-demo",
        active: true,
        usage_count: 214,
        success_count: 211,
        failed_count: 3,
      },
      {
        name: "Gmail SMTP",
        type: "smtp",
        smtp_config: {
          host: "smtp.gmail.com",
          port: 587,
          username: "demo@vertrag.ma",
          password: "mock",
        },
        active: true,
        usage_count: 187,
        success_count: 180,
        failed_count: 7,
      },
    ]);
    console.log("[SEED] 2 mail senders (mock) créés");
  }

  // ── Demande + postulations ─────────────────────────────────
  if ((await PostulationDemande.countDocuments()) === 0) {
    const companies = await Company.find()
      .select("_id")
      .sort({ createdAt: 1 })
      .lean();

    const demande = await PostulationDemande.create({
      ref_number: "VT-P-2026-000101",
      user_id: user._id,
      categorie_ids: [categories[1]._id, categories[3]._id],
      nmbr_total: 500,
      nmbr_per_day: 300,
      price: 5,
      status: "payed",
      confirmed_at: new Date(),
    });

    // 500 postulations (unique companies): 300 tomorrow + 200 the day after.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const docs: Record<string, unknown>[] = [];
    for (let i = 0; i < 500 && i < companies.length; i++) {
      const dayOffset = i < 300 ? 1 : 2;
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + dayOffset);
      // First 40 already sent, a few failed, rest pending.
      const status = i < 40 ? (i % 13 === 0 ? "echouee" : "envoyee") : "en_attente";
      docs.push({
        user_id: user._id,
        company_id: companies[i]._id,
        demande_id: demande._id,
        scheduled_at: date,
        posted_at: status === "envoyee" ? new Date() : null,
        status,
        failed_reason: status === "echouee" ? "SMTP connection timeout (demo)" : null,
      });
    }
    await Postulation.insertMany(docs);
    console.log(`[SEED] demande payée + ${docs.length} postulations créées`);
  }

  // ── Pending add-dossier demande ────────────────────────────
  if ((await DossierDemandeForAdd.countDocuments()) === 0) {
    await DossierDemandeForAdd.create({
      ref_number: "VT-DA-2026-000042",
      user_id: user2._id,
      dossier_pdf_link: "https://mock-cloudinary.vertrag.ma/vertrag_ma/dossier/salma-dossier.pdf",
      status: "en_attente",
    });
    console.log("[SEED] demande d'ajout de dossier en attente créée");
  }
}
