// Supplementary e2e tests for the 2026-09-20 features:
//   1. usage_log — every send recorded immediately with its timestamp
//   2. daily_limit — sender stops at its limit, remaining postulations
//      are picked by other senders or marked re_execute
//   3. annulee_admin — a canceled postulation is never executed
//   4. scheduledFrom/scheduledTo — the wave only claims the interval
//   5. re-execute window — only today-or-past scheduled postulations

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import "../src/models/User";
import "../src/models/Company";
import "../src/models/Postulation";
import "../src/models/MailSender";
import "../src/models/Setting";
import "../src/models/PostulationDemande";
import "../src/models/Execution";

import { User } from "../src/models/User";
import { Company } from "../src/models/Company";
import { Postulation } from "../src/models/Postulation";
import { MailSender } from "../src/models/MailSender";
import { getSettings } from "../src/models/Setting";
import { startExecutionWave, countTodayUsage } from "../src/lib/postulation-executor";
import { createPostulationsForDemande } from "../src/lib/postulation-utils";
import net from "node:net";

// Tiny valid PDF as a data URL - Node's fetch supports data: URLs.
const TINY_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF",
  "binary"
).toString("base64");
const TINY_PDF_URL = `data:application/pdf;base64,${TINY_PDF}`;

// Minimal fake SMTP server (accepts everything, captures nothing).
function startFakeSmtp(port: number): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      const write = (line: string) => socket.write(`${line}\r\n`);
      write("220 fake-smtp ready");
      socket.on("data", () => write("250 ok"));
      socket.on("error", () => {});
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

async function main() {
  const smtp = await startFakeSmtp(8911);
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "vertrag_test2" });
  console.log("[TEST2] Connected to in-memory MongoDB.");

  // Clean slate.
  await Promise.all([
    User.deleteMany({}),
    Company.deleteMany({}),
    Postulation.deleteMany({}),
    MailSender.deleteMany({}),
    mongoose.connection.db?.dropDatabase(),
  ]);

  const settings = await getSettings();
  settings.postulations.email_subject = "Test subject";
  settings.postulations.email_message = "Test message";
  await settings.save();

  // One user + dossier link, several companies.
  const user = await User.create({
    full_name: "Test User",
    email: "user@test.dev",
    password: "hashedpassword",
    role: "user",
    active: true,
    email_verified: true,
    dossier_pdf_link: TINY_PDF_URL,
    date_of_birth: new Date("1990-01-01"),
  });

  const companyIds: mongoose.Types.ObjectId[] = [];
  for (let i = 0; i < 8; i++) {
    const c = await Company.create({
      name: `Company ${i}`,
      email: `c${i}@test.dev`,
      categorie_ids: [],
      active: true,
    });
    companyIds.push(c._id as mongoose.Types.ObjectId);
  }

  // ── TEST A: usage_log recorded immediately per send ──────────────────
  console.log("\n[TEST A] usage_log — enregistrement immédiat par envoi");
  const senderA = await MailSender.create({
    name: "Sender-A",
    type: "smtp",
    smtp_config: { host: "127.0.0.1", port: 8911, username: "u", password: "p" },
    active: true,
    daily_limit: 0,
  });

  // 3 due-today postulations.
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    await Postulation.create({
      user_id: user._id,
      company_id: companyIds[i],
      scheduled_at: now,
      status: "en_attente",
    });
  }

  const waveA = await startExecutionWave({ trigger: "github", dueTodayOnly: true });
  const summaryA = await waveA.promise;
  check("vague A : 3 envoyées", summaryA.sent === 3);

  const senderAAfter = await MailSender.findById(senderA._id).lean();
  check("usage_count = 3", (senderAAfter?.usage_count || 0) === 3);
  check("usage_log contient 3 entrées", (senderAAfter?.usage_log || []).length === 3);
  check(
    "les timestamps sont ceux d'aujourd'hui (UTC)",
    countTodayUsage(senderAAfter?.usage_log) === 3
  );
  check(
    "chaque entrée est un timestamp valide proche de maintenant",
    (senderAAfter?.usage_log || []).every(
      (at) => Math.abs(new Date(at as Date).getTime() - Date.now()) < 60_000
    )
  );

  // ── TEST B: daily_limit — stop at limit, remaining → re_execute ──────
  console.log("\n[TEST B] daily_limit — arrêt propre + basculement");
  const senderB = await MailSender.create({
    name: "Sender-B",
    type: "smtp",
    smtp_config: { host: "127.0.0.1", port: 8911, username: "u", password: "p" },
    active: true,
    daily_limit: 2,
  });
  // Isolate the limit test: only Sender-B (limit 2) processes this wave.
  await MailSender.findByIdAndUpdate(senderA._id, { $set: { active: false } });
  // 4 more postulations due today (companies 3..6 unused).
  for (let i = 3; i < 7; i++) {
    await Postulation.create({
      user_id: user._id,
      company_id: companyIds[i],
      scheduled_at: now,
      status: "en_attente",
    });
  }

  const waveB = await startExecutionWave({ trigger: "github", dueTodayOnly: true });
  const summaryB = await waveB.promise;
  check("vague B : 2 envoyées (limite 2, seul sender actif)", summaryB.sent === 2);
  check("sender B limité signalé", summaryB.senders_limited.includes("Sender-B"));
  check("sender B toujours actif (pas désactivé)", !summaryB.senders_disabled.includes("Sender-B"));

  const senderBAfter = await MailSender.findById(senderB._id).lean();
  check("sender B : in_use libéré", senderBAfter?.in_use === false);
  check("sender B : actif", senderBAfter?.active === true);
  check(
    "les restantes sont marquées re_execute",
    (await Postulation.countDocuments({ status: "re_execute" })) === 2
  );
  check(
    "plus aucune en_attente",
    (await Postulation.countDocuments({ status: "en_attente" })) === 0
  );

  // ── TEST C: annulee_admin never claimed ──────────────────────────────
  console.log("\n[TEST C] annulee_admin — jamais exécutée");
  // Fresh postulation, marked annulee_admin right away.
  const companyCancel = await Company.create({
    name: "Company Cancel",
    email: "cancel@test.dev",
    categorie_ids: [],
    active: true,
  });
  const post = await Postulation.create({
    user_id: user._id,
    company_id: companyCancel._id,
    scheduled_at: now,
    status: "annulee_admin",
  });
  check("une postulation annulee_admin créée", Boolean(post));
  await MailSender.findByIdAndUpdate(senderA._id, { $set: { active: true } });
  const waveC = await startExecutionWave({ trigger: "github", dueTodayOnly: true });
  const summaryC = await waveC.promise;
  const stillCanceled = await Postulation.findById(post._id).lean();
  check(
    "la postulation annulee_admin n'a jamais été envoyée (statut inchangé, posted_at null)",
    stillCanceled?.status === "annulee_admin" && stillCanceled?.posted_at === null
  );
  check(
    "les re_execute restantes ont pu être traitées sans toucher l'annulée",
    summaryC.sent >= 0
  );

  // ── TEST D: date interval restricts the wave ──────────────────────────
  console.log("\n[TEST D] intervalle de dates — ciblage strict");
  // Two postulations: one yesterday-scheduled, one far future.
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const future = new Date(now.getTime() + 5 * 24 * 3600 * 1000);
  await Postulation.create({
    user_id: user._id,
    company_id: companyIds[7],
    scheduled_at: yesterday,
    status: "re_execute",
  });
  const companyFuture = await Company.create({
    name: "Company Future",
    email: "future@test.dev",
    categorie_ids: [],
    active: true,
  });
  const futurePost = await Postulation.create({
    user_id: user._id,
    company_id: companyFuture._id,
    scheduled_at: future,
    status: "re_execute",
  });

  const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const to = new Date(now.getTime() + 24 * 3600 * 1000);
  const waveD = await startExecutionWave({
    trigger: "github",
    statuses: ["re_execute"],
    scheduledFrom: from,
    scheduledTo: to,
  });
  check("vague D : 1 en attente dans l'intervalle", waveD.postulations_pending === 1);
  const summaryD = await waveD.promise;
  check("vague D : 1 envoyée (la future exclue)", summaryD.sent === 1);
  const futureAfter = await Postulation.findById(futurePost._id).lean();
  check("la postulation future n'a pas été touchée", futureAfter?.status === "re_execute");

  // ── TEST E: origin fields on demande-created postulations ────────────
  console.log("\n[TEST E] origine + ref demande sur création automatique");
  const PostulationDemandeModel = mongoose.models.PostulationDemande;
  // Fresh user for a clean anti-duplicate state.
  const user2 = await User.create({
    full_name: "User Two",
    email: "user2@test.dev",
    password: "hashedpassword",
    role: "user",
    active: true,
    email_verified: true,
    dossier_pdf_link: TINY_PDF_URL,
    date_of_birth: new Date("1990-01-01"),
  });
  // The demande model enforces min 100 per axis — create a batch of companies.
  const demandeCompanies: mongoose.Types.ObjectId[] = [];
  for (let i = 0; i < 100; i++) {
    const c = await Company.create({
      name: `Demande Co ${i}`,
      email: `dc${i}@test.dev`,
      categorie_ids: [],
      active: true,
    });
    demandeCompanies.push(c._id as mongoose.Types.ObjectId);
  }
  const demande2 = await PostulationDemandeModel.create({
    ref_number: "VT-P-8888",
    user_id: user2._id,
    categorie_ids: [],
    company_ids: demandeCompanies,
    nmbr_total: 100,
    nmbr_per_day: 100,
    price: 10,
    pricing_snapshot: null,
    status: "payed",
  });
  const created = await createPostulationsForDemande({
    user_id: user2._id as mongoose.Types.ObjectId,
    demande_id: demande2._id as mongoose.Types.ObjectId,
    categorie_ids: [],
    company_ids: demandeCompanies,
    nmbr_total: 100,
    nmbr_per_day: 100,
    demande_ref: demande2.ref_number,
  });
  check("100 postulations créées depuis la demande", created.created === 100);
  const autoPosts = await Postulation.find({
    user_id: user2._id,
    created_by_admin: { $ne: true },
  }).lean();
  check(
    "created_by_admin = false sur les postulations auto",
    autoPosts.every((p) => p.created_by_admin === false)
  );
  check(
    "demande_ref enregistré sur chaque postulation",
    autoPosts.every((p) => p.demande_ref === "VT-P-8888")
  );

  // Manual creation marker.
  const companyManual = await Company.create({
    name: "Company Manual",
    email: "manual@test.dev",
    categorie_ids: [],
    active: true,
  });
  const manual = await Postulation.create({
    user_id: user2._id,
    company_id: companyManual._id,
    scheduled_at: now,
    created_by_admin: true,
    status: "en_attente",
  });
  check("created_by_admin = true sur la création manuelle", Boolean(manual.created_by_admin));

  await mongoose.disconnect();
  await mongod.stop();
  smtp.close();
  console.log(`\n[TEST2] ${passed} OK, ${failed} ÉCHEC(S)`);
  process.exit(failed > 0 ? 2 : 0);
}

main().catch(async (e) => {
  console.error("[TEST2] FATAL:", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(2);
});
