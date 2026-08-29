// Daily postulation sender — one batch per workflow instance.
//
// Pipeline per postulation (status en_attente or re_execute, scheduled today or overdue):
//   1. Load the user (dossier_pdf_link required)
//   2. Load the company (email required)
//   3. Atomically pick the active mail sender with the LOWEST usage_count
//   4. Download the dossier PDF from Cloudinary
//   5. Send the fixed message (from settings, German) + PDF attachment
//   6. On success: status=envoyee, posted_at=now
//      On failure: status=echouee, failed_reason recorded — and we CONTINUE
//      to the next postulation (per specification).
//
// Exit codes: 0 = there may be more postulations to process (re-trigger),
//             1 = nothing left to do.

import { connectDB, disconnectDB } from "./db";
import { Postulation } from "../src/models/Postulation";
import { User } from "../src/models/User";
import { Company } from "../src/models/Company";
import { MailSender } from "../src/models/MailSender";
import { getSettings } from "../src/models/Setting";
import { sendViaMailSender, textToHtml } from "../src/lib/mailer-core";

const BATCH_SIZE = 60;
const SEND_DELAY_MS = 400;

async function main() {
  await connectDB();

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  // Postulations due today (or overdue), FIFO by scheduled_at.
  const postulations = await Postulation.find({
    status: { $in: ["en_attente", "re_execute"] },
    scheduled_at: { $lte: endOfToday },
  })
    .sort({ scheduled_at: 1 })
    .limit(BATCH_SIZE)
    .lean();

  if (postulations.length === 0) {
    console.log("[SEND] Aucune postulation à traiter aujourd'hui.");
    await disconnectDB();
    process.exit(1); // done — nothing more
  }

  console.log(`[SEND] ${postulations.length} postulation(s) à traiter.`);

  const settings = await getSettings();
  const message = settings.postulations.email_message;
  const subject = settings.postulations.email_subject;

  let sent = 0;
  let failed = 0;

  for (const postulation of postulations) {
    const tag = `[${String(postulation._id).slice(-6)}]`;
    try {
      // 1. User dossier.
      const user = await User.findById(postulation.user_id).select("full_name dossier_pdf_link").lean();
      if (!user) throw new Error("Utilisateur introuvable");
      if (!user.dossier_pdf_link) {
        throw new Error("Aucun dossier actif pour cet utilisateur (dossier_pdf_link manquant)");
      }

      // 2. Company email.
      const company = await Company.findById(postulation.company_id).select("name email").lean();
      if (!company) throw new Error("Entreprise introuvable");
      if (!company.email) throw new Error("Entreprise sans adresse email");

      // 3. Mail sender with min usage (atomic claim: $inc makes it rotate).
      const mailSender = await MailSender.findOneAndUpdate(
        { active: true },
        { $inc: { usage_count: 1 } },
        { new: true, sort: { usage_count: 1 } }
      );
      if (!mailSender) throw new Error("Aucun mail sender actif disponible");

      // 4. Download the dossier PDF.
      const pdfResponse = await fetch(user.dossier_pdf_link);
      if (!pdfResponse.ok) {
        throw new Error(`Téléchargement du dossier échoué (HTTP ${pdfResponse.status})`);
      }
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      // 5. Send email with attachment.
      await sendViaMailSender(mailSender, {
        to: company.email,
        subject,
        html: textToHtml(message),
        attachments: [{ filename: "Bewerbungsunterlagen.pdf", content: pdfBuffer }],
      });

      // 6a. Success.
      await Postulation.findByIdAndUpdate(postulation._id, {
        status: "envoyee",
        posted_at: new Date(),
        mail_sender_id: mailSender._id,
        failed_reason: null,
      });
      await MailSender.findByIdAndUpdate(mailSender._id, { $inc: { success_count: 1 } });
      sent += 1;
      console.log(`${tag} ENVOYÉE → ${company.name} <${company.email}> via ${mailSender.name}`);
    } catch (error) {
      // 6b. Failure — record and CONTINUE to the next postulation.
      const reason = error instanceof Error ? error.message : String(error);
      await Postulation.findByIdAndUpdate(postulation._id, {
        status: "echouee",
        failed_reason: reason.slice(0, 500),
      }).catch(() => {});
      failed += 1;
      console.error(`${tag} ÉCHOUÉE — ${reason}`);
    }

    // Polite delay between sends.
    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  }

  console.log(`[SEND] Terminé : ${sent} envoyée(s), ${failed} échouée(s).`);

  // Re-trigger check: anything left due today after this batch?
  const remaining = await Postulation.countDocuments({
    status: { $in: ["en_attente", "re_execute"] },
    scheduled_at: { $lte: endOfToday },
  });

  await disconnectDB();
  process.exit(remaining > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[SEND] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
