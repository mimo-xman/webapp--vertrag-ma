// Local smoke test of the postulation execution engine.
//
// - Starts an in-memory MongoDB (no real database needed).
// - Starts a FAKE local SMTP server (no real email is sent — the whole
//   SMTP dialogue is captured in memory).
// - Runs the wave executor end-to-end: parallel executions per mail sender,
//   atomic postulation claiming (no double send), sender failure disabling,
//   single-postulation execution, stuck-run recovery.
//
// Usage (from the repo root — uses the app's node_modules):
//   npx tsx workflow/test-executor.ts
//   # or: cd workflow && npx tsx test-executor.ts

import net from "node:net";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Register models (same side-effect imports as workflow/db.ts).
import "../src/models/User";
import "../src/models/Company";
import "../src/models/Postulation";
import "../src/models/MailSender";
import "../src/models/Setting";
import "../src/models/Execution";

import { User } from "../src/models/User";
import { Company } from "../src/models/Company";
import { Postulation } from "../src/models/Postulation";
import { MailSender } from "../src/models/MailSender";
import { getSettings } from "../src/models/Setting";
import { Execution } from "../src/models/Execution";
import {
  startExecutionWave,
  executeSinglePostulation,
  recoverStuckExecutions,
  hasActiveExecution,
} from "../src/lib/postulation-executor";

// ── Fake SMTP server (captures mail instead of sending it) ─────────────

interface CapturedMail {
  from: string;
  to: string;
  body: string;
}

function startFakeSmtpServer(port: number): Promise<{ server: net.Server; mails: CapturedMail[] }> {
  const mails: CapturedMail[] = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let from = "";
    let to = "";
    let body = "";

    const write = (line: string) => socket.write(`${line}\r\n`);
    write("220 fake-smtp ready");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("binary");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          body = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          mails.push({ from, to, body });
          from = "";
          to = "";
          write("250 accepted");
          continue;
        }
        const nl = buffer.indexOf("\r\n");
        if (nl === -1) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          write("250-fake-smtp");
          write("250 8BITMIME");
        } else if (upper.startsWith("MAIL FROM")) {
          from = line;
          write("250 OK");
        } else if (upper.startsWith("RCPT TO")) {
          to = line;
          write("250 OK");
        } else if (upper.startsWith("DATA")) {
          inData = true;
          write("354 go ahead");
        } else if (upper.startsWith("QUIT")) {
          write("221 bye");
          socket.end();
        } else {
          write("250 OK");
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, mails }));
  });
}

// Tiny valid PDF as a data URL — used as the user's dossier_pdf_link
// (Node's fetch supports data: URLs).
const TINY_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF",
  "binary"
).toString("base64");
const TINY_PDF_URL = `data:application/pdf;base64,${TINY_PDF}`;

// ── Tiny assertion helpers ──────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("[TEST] Starting in-memory MongoDB…");
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "vertrag_test" });
  console.log("[TEST] Connected.\n");

  const { server: smtp, mails } = await startFakeSmtpServer(8899);

  // Fresh state.
  await Promise.all([
    User.deleteMany({}),
    Company.deleteMany({}),
    Postulation.deleteMany({}),
    MailSender.deleteMany({}),
    Execution.deleteMany({}),
  ]);
  await getSettings(); // creates defaults

  const admin = await User.create({
    full_name: "Admin Test",
    email: "admin@test.local",
    password: "hashedpassword",
    role: "admin",
    active: true,
  });
  const user = await User.create({
    full_name: "Utilisateur Test",
    email: "user@test.local",
    password: "hashedpassword",
    role: "user",
    active: true,
    dossier_pdf_link: TINY_PDF_URL,
  });

  const companies = await Company.create([
    { name: "Firma Alpha", email: "alpha@test.local", categorie_ids: [] },
    { name: "Firma Beta", email: "beta@test.local", categorie_ids: [] },
    { name: "Firma Gamma", email: "gamma@test.local", categorie_ids: [] },
    { name: "Firma Delta", email: "delta@test.local", categorie_ids: [] },
    { name: "Firma Epsilon", email: "epsilon@test.local", categorie_ids: [] },
    { name: "Firma Zeta", email: "zeta@test.local", categorie_ids: [] },
  ]);

  // ══════════════════════════════════════════════════════════════════════
  console.log("[TEST 1] Wave with 2 senders → 2 parallel executions, no double send");

  const smtpSender = await MailSender.create({
    name: "SMTP OK",
    type: "smtp",
    smtp_config: { host: "127.0.0.1", port: 8899, username: "user", password: "pass" },
    active: true,
  });
  const smtpSender2 = await MailSender.create({
    name: "SMTP OK 2",
    type: "smtp",
    smtp_config: { host: "127.0.0.1", port: 8899, username: "user2", password: "pass2" },
    active: true,
  });

  const dueToday = new Date();
  dueToday.setUTCHours(6, 0, 0, 0);
  const postulationDocs = companies.map((c: { _id: unknown }) => ({
    user_id: user._id,
    company_id: c._id,
    scheduled_at: dueToday,
    status: "en_attente" as const,
  }));
  await Postulation.insertMany(postulationDocs);

  const wave = await startExecutionWave({ trigger: "server" });
  const summary = await wave.promise;

  check("2 exécutions créées (une par sender)", wave.execution_ids.length === 2);
  check("6 envois réussis au total", summary.sent === 6, `sent=${summary.sent}`);
  check("Aucun échec", summary.failed === 0, `failed=${summary.failed}`);
  check("6 emails capturés par le faux SMTP", mails.length === 6, `mails=${mails.length}`);

  const postulationsAfter = await Postulation.find().lean();
  check(
    "Chaque postulation a exactement 1 exécution (pas de double envoi)",
    postulationsAfter.every((p) => p.executions.length === 1 && p.executions[0].status === "success")
  );
  check(
    "Toutes les postulations passées à envoyee",
    postulationsAfter.every((p) => p.status === "envoyee" && p.posted_at !== null)
  );
  check(
    "Chaque postulation référence un mail_sender_id",
    postulationsAfter.every((p) => p.mail_sender_id !== null)
  );
  const sendersAfter = await MailSender.find().lean();
  check(
    "Les 2 senders relâchés (in_use=false) et actifs",
    sendersAfter.every((s) => !s.in_use && s.active)
  );
  check(
    "Compteurs senders : usage+success = 3 chacun",
    sendersAfter.every((s) => s.usage_count === 3 && s.success_count === 3),
    JSON.stringify(sendersAfter.map((s) => [s.usage_count, s.success_count]))
  );
  const executionsAfter = await Execution.find().lean();
  check(
    "Exécutions terminées avec stats correctes",
    executionsAfter.every(
      (e) => e.status === "completed" && e.finished_at !== null && e.success + e.failed === 3
    )
  );
  const perSenderUsage = postulationsAfter.reduce<Record<string, number>>((acc, p) => {
    const key = String(p.mail_sender_id);
    acc[key] = (acc[key] || 0) + 1;
    acc.__total = (acc.__total || 0) + 1;
    return acc;
  }, {});
  check(
    "Répartition par sender (3+3)",
    perSenderUsage.__total === 6 &&
      Object.entries(perSenderUsage)
        .filter(([k]) => k !== "__total")
        .every(([, v]) => v === 3),
    JSON.stringify(perSenderUsage)
  );
  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  console.log("[TEST 2] Sender failure → sender disabled + error saved, execution fatal_error");

  // Isolate the broken sender: deactivate the two good ones so the wave
  // can ONLY claim the broken sender (deterministic outcome).
  await MailSender.updateMany(
    { _id: { $in: [smtpSender._id, smtpSender2._id] } },
    { $set: { active: false } }
  );

  const badSender = await MailSender.create({
    name: "SMTP KO",
    type: "smtp",
    smtp_config: { host: "127.0.0.1", port: 1, username: "u", password: "p" }, // refused instantly
    active: true,
  });

  const failingCompany = await Company.create({
    name: "Firma Eta",
    email: "eta@test.local",
    categorie_ids: [],
  });
  const failingPostulation = await Postulation.create({
    user_id: user._id,
    company_id: failingCompany._id,
    scheduled_at: dueToday,
    status: "en_attente",
  });

  const wave2 = await startExecutionWave({ trigger: "server" });
  const summary2 = await wave2.promise;

  check("1 exécution créée (un seul sender disponible)", wave2.execution_ids.length === 1);
  check("1 échec enregistré", summary2.failed === 1, `failed=${summary2.failed}`);
  check("Sender KO désactivé par l'échec", summary2.senders_disabled.length === 1);

  const badSenderAfter = await MailSender.findById(badSender._id).lean();
  check(
    "Sender KO : active=false, in_use=false, last_error rempli",
    badSenderAfter &&
      badSenderAfter.active === false &&
      badSenderAfter.in_use === false &&
      typeof badSenderAfter.last_error === "string" &&
      badSenderAfter.last_error.length > 0,
    JSON.stringify(badSenderAfter && { active: badSenderAfter.active, err: badSenderAfter.last_error })
  );
  const failingPostulationAfter = await Postulation.findById(failingPostulation._id).lean();
  check(
    "Postulation échouée avec motif + exécution enregistrée",
    failingPostulationAfter &&
      failingPostulationAfter.status === "echouee" &&
      !!failingPostulationAfter.failed_reason &&
      failingPostulationAfter.executions.length === 1 &&
      failingPostulationAfter.executions[0].status === "failed"
  );
  const badExecution = await Execution.findById(wave2.execution_ids[0]).lean();
  check(
    "Exécution avec fatal_error (sender désactivé)",
    badExecution && !!badExecution.fatal_error && badExecution.status === "completed"
  );
  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  console.log("[TEST 3] executeSinglePostulation (admin manual, with sender selection)");

  // Re-enable one sender for the manual execution.
  await MailSender.findByIdAndUpdate(smtpSender._id, { active: true });

  const manualCompany = await Company.create({
    name: "Firma Theta",
    email: "theta@test.local",
    categorie_ids: [],
  });
  const manualPostulation = await Postulation.create({
    user_id: user._id,
    company_id: manualCompany._id,
    scheduled_at: new Date(Date.now() + 86400000), // tomorrow — still executable manually
    status: "en_attente",
  });

  const single = await executeSinglePostulation({
    postulation_id: String(manualPostulation._id),
    mail_sender_id: String(smtpSender._id),
    admin_id: String(admin._id),
  });
  check("Exécution manuelle réussie", single.status === "success", JSON.stringify(single));
  check("Référence VT-E- générée", /^VT-E-\d{4}-\d{6}$/.test(single.ref_number));
  check("Sender non désactivé", single.sender_disabled === false);

  const manualAfter = await Postulation.findById(manualPostulation._id).lean();
  check(
    "Postulation manuelle → envoyee + 1 exécution",
    manualAfter &&
      manualAfter.status === "envoyee" &&
      manualAfter.executions.length === 1 &&
      manualAfter.executions[0].status === "success"
  );
  const manualExecution = await Execution.findOne({ ref_number: single.ref_number }).lean();
  check(
    "Exécution trigger=admin, created_by=admin",
    manualExecution &&
      manualExecution.trigger === "admin" &&
      String(manualExecution.created_by) === String(admin._id)
  );

  // Double execution attempt must be rejected (already envoyee).
  let rejected = false;
  try {
    await executeSinglePostulation({
      postulation_id: String(manualPostulation._id),
      mail_sender_id: String(smtpSender._id),
    });
  } catch {
    rejected = true;
  }
  check("Re-exécution d'une postulation envoyée rejetée", rejected);
  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  console.log("[TEST 4] Stuck-run recovery (crashed worker simulation)");

  const stuckCompany = await Company.create({
    name: "Firma Iota",
    email: "iota@test.local",
    categorie_ids: [],
  });
  const stuckPostulation = await Postulation.create({
    user_id: user._id,
    company_id: stuckCompany._id,
    scheduled_at: dueToday,
    status: "executing", // stuck
  });
  // Bypass mongoose timestamps middleware — set updatedAt directly so the
  // postulation looks abandoned 30 minutes ago.
  await Postulation.collection.updateOne(
    { _id: stuckPostulation._id },
    { $set: { updatedAt: new Date(Date.now() - 30 * 60 * 1000) } }
  );
  const staleExecution = await Execution.create({
    ref_number: "VT-E-2026-000099",
    trigger: "github",
    status: "running",
    mail_sender_id: smtpSender2._id,
    mail_sender_name: "SMTP OK 2",
    started_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
  });
  await MailSender.findByIdAndUpdate(smtpSender2._id, { in_use: true }); // stuck claim

  await recoverStuckExecutions();

  const recoveredPostulation = await Postulation.findById(stuckPostulation._id).lean();
  check("Postulation bloquée remise en_attente", recoveredPostulation?.status === "en_attente");
  const recoveredExecution = await Execution.findById(staleExecution._id).lean();
  check(
    "Exécution obsolète clôturée avec fatal_error",
    recoveredExecution?.status === "completed" && !!recoveredExecution?.fatal_error
  );
  const releasedSender = await MailSender.findById(smtpSender2._id).lean();
  check("Sender bloqué libéré (in_use=false)", releasedSender?.in_use === false);
  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  console.log("[TEST 5] hasActiveExecution guard");

  // No fresh running executions → guard must be false.
  check(
    "Aucune exécution active (toutes terminées)",
    (await hasActiveExecution("server")) === false
  );

  // Create a fresh running execution → guard must be true.
  const runningExecution = await Execution.create({
    ref_number: "VT-E-2026-000100",
    trigger: "server",
    status: "running",
    mail_sender_name: "X",
    started_at: new Date(),
  });
  check("Exécution active détectée", (await hasActiveExecution("server")) === true);
  check(
    "Autre type non impacté",
    (await hasActiveExecution("github")) === false
  );
  await Execution.findByIdAndDelete(runningExecution._id);

  // ══════════════════════════════════════════════════════════════════════
  console.log("[TEST 6] Automatic postulation creation (admin confirms a paid demande)");

  // Fresh user so the anti-duplicate index doesn't interfere.
  const user2 = await User.create({
    full_name: "Utilisateur Deux",
    email: "user2@test.local",
    password: "hashedpassword",
    role: "user",
    active: true,
    dossier_pdf_link: TINY_PDF_URL,
  });
  const cat = await (await import("../src/models/Category")).Category.create({
    name: "Test Catégorie",
  });
  // Enough companies for 5 postulations at 2/day.
  const waveCompanies = await Company.create(
    [1, 2, 3, 4, 5].map((n) => ({
      name: `Firma W${n}`,
      email: `w${n}@test.local`,
      categorie_ids: [cat._id],
    }))
  );

  const { createPostulationsForDemande } = await import("../src/lib/postulation-utils");
  const demandeId = new mongoose.Types.ObjectId();
  const result = await createPostulationsForDemande({
    user_id: user2._id as unknown as mongoose.Types.ObjectId,
    demande_id: demandeId,
    categorie_ids: [cat._id as unknown as mongoose.Types.ObjectId],
    nmbr_total: 5,
    nmbr_per_day: 2,
  });

  check("5 postulations créées", result.created === 5, JSON.stringify(result));
  check(
    "Étalement sur 3 jours (2+2+1) à partir de demain",
    result.days.length === 3 &&
      result.days[0].count === 2 &&
      result.days[1].count === 2 &&
      result.days[2].count === 1,
    JSON.stringify(result.days)
  );
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const wavePostulations = await Postulation.find({ user_id: user2._id }).sort({
    scheduled_at: 1,
  }).lean();
  check(
    "Première postulation programmée demain",
    wavePostulations.length > 0 &&
      new Date(wavePostulations[0].scheduled_at).toISOString().slice(0, 10) ===
        tomorrow.toISOString().slice(0, 10)
  );
  check(
    "Toutes en_attente avec demande_id renseigné",
    wavePostulations.every(
      (p) => p.status === "en_attente" && String(p.demande_id) === String(demandeId)
    )
  );
  check(
    "Respect du rythme par jour (max 2/jour)",
    result.days.every((d) => d.count <= 2)
  );

  // ══════════════════════════════════════════════════════════════════════
  console.log("[TEST 7] Pricing — nouveau minimum total à 100");

  const { buildTotalOptions, validateDemandeInput, DEFAULT_PRICING } = await import(
    "../src/lib/pricing"
  );
  check("DEFAULT_PRICING.min_total = 100", DEFAULT_PRICING.min_total === 100);
  const options = buildTotalOptions(1500, { ...DEFAULT_PRICING });
  check(
    "Options commencent à 100 (100, 600, 1100)",
    options[0] === 100 && options[1] === 600 && options[2] === 1100,
    JSON.stringify(options)
  );
  check(
    "Demande 100 total / 100 par jour acceptée",
    validateDemandeInput(100, 100, 1000, { ...DEFAULT_PRICING }) === null
  );
  check(
    "50 rejeté (sous le minimum)",
    validateDemandeInput(50, 100, 1000, { ...DEFAULT_PRICING }) !== null
  );
  const { buildPerDayOptions } = await import("../src/lib/pricing");
  check(
    "Options/jour pour un total de 100 : [100]",
    JSON.stringify(buildPerDayOptions(100, { ...DEFAULT_PRICING })) === "[100]"
  );

  // ══════════════════════════════════════════════════════════════════════
  smtp.close();
  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n[TEST] ${passed} OK, ${failed} ÉCHEC(S)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error("[TEST] FATAL:", error);
  process.exit(1);
});
