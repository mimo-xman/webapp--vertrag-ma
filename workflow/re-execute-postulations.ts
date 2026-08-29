// Re-execution worker — MANUAL trigger only (launched from the admin panel
// via the GitHub API, or from the Actions tab).
// Processes all postulations with status re_execute, same pipeline as the
// daily sender. Failed ones go back to echouee (with the reason).

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

  const postulations = await Postulation.find({ status: "re_execute" })
    .sort({ scheduled_at: 1 })
    .limit(BATCH_SIZE)
    .lean();

  if (postulations.length === 0) {
    console.log("[RE-EXECUTE] Aucune postulation à relancer.");
    await disconnectDB();
    process.exit(1);
  }

  console.log(`[RE-EXECUTE] ${postulations.length} postulation(s) à relancer.`);

  const settings = await getSettings();
  const message = settings.postulations.email_message;
  const subject = settings.postulations.email_subject;

  let sent = 0;
  let failed = 0;

  for (const postulation of postulations) {
    const tag = `[${String(postulation._id).slice(-6)}]`;
    try {
      const user = await User.findById(postulation.user_id).select("full_name dossier_pdf_link").lean();
      if (!user) throw new Error("Utilisateur introuvable");
      if (!user.dossier_pdf_link) throw new Error("Aucun dossier actif pour cet utilisateur");

      const company = await Company.findById(postulation.company_id).select("name email").lean();
      if (!company) throw new Error("Entreprise introuvable");
      if (!company.email) throw new Error("Entreprise sans adresse email");

      const mailSender = await MailSender.findOneAndUpdate(
        { active: true },
        { $inc: { usage_count: 1 } },
        { new: true, sort: { usage_count: 1 } }
      );
      if (!mailSender) throw new Error("Aucun mail sender actif disponible");

      const pdfResponse = await fetch(user.dossier_pdf_link);
      if (!pdfResponse.ok) {
        throw new Error(`Téléchargement du dossier échoué (HTTP ${pdfResponse.status})`);
      }
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      await sendViaMailSender(mailSender, {
        to: company.email,
        subject,
        html: textToHtml(message),
        attachments: [{ filename: "Bewerbungsunterlagen.pdf", content: pdfBuffer }],
      });

      await Postulation.findByIdAndUpdate(postulation._id, {
        status: "envoyee",
        posted_at: new Date(),
        mail_sender_id: mailSender._id,
        failed_reason: null,
      });
      await MailSender.findByIdAndUpdate(mailSender._id, { $inc: { success_count: 1 } });
      sent += 1;
      console.log(`${tag} RELANCÉE → ${company.name} <${company.email}> via ${mailSender.name}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await Postulation.findByIdAndUpdate(postulation._id, {
        status: "echouee",
        failed_reason: `[re-execute] ${reason}`.slice(0, 500),
      }).catch(() => {});
      failed += 1;
      console.error(`${tag} ÉCHOUÉE — ${reason}`);
    }

    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  }

  console.log(`[RE-EXECUTE] Terminé : ${sent} envoyée(s), ${failed} échouée(s).`);

  const remaining = await Postulation.countDocuments({ status: "re_execute" });
  await disconnectDB();
  process.exit(remaining > 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("[RE-EXECUTE] FATAL:", error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
