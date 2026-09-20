import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { MailSender } from "@/models/MailSender";
import { logAdminAction } from "@/lib/audit";
import { sendViaMailSender, textToHtml } from "@/lib/mailer-core";

// POST /api/admin/mail-senders/[id]/test - "Envoyer le test".
// Sends a real test email through the sender, using the method that
// matches its type automatically: API (Brevo REST) for "api" senders,
// SMTP (nodemailer: Gmail...) for "smtp" senders. Any future type only
// needs to be taught to lib/mailer-core.ts, not to this route.
//
// The usage is recorded IMMEDIATELY (usage_log + counters), exactly like a
// postulation send: a test consumes a real email from the provider quota.

const testSchema = z.object({
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Destinataire ou message de test invalide" },
      { status: 400 }
    );
  }

  await connectDB();
  const sender = await MailSender.findById(id);
  if (!sender) {
    return NextResponse.json({ success: false, error: "Service introuvable" }, { status: 404 });
  }

  // Type-specific validation before attempting anything.
  if (sender.type === "api" && !sender.api_key) {
    return NextResponse.json(
      { success: false, error: "Ce service API n'a pas de clé API configurée" },
      { status: 400 }
    );
  }
  if (sender.type === "api" && !sender.sender_email) {
    return NextResponse.json(
      {
        success: false,
        error: "Ce service API n'a pas d'adresse expéditeur configurée (requise par Brevo)",
      },
      { status: 400 }
    );
  }
  if (sender.type === "smtp" && !sender.smtp_config?.host) {
    return NextResponse.json(
      { success: false, error: "Ce service SMTP n'a pas de configuration SMTP" },
      { status: 400 }
    );
  }

  try {
    await sendViaMailSender(sender, {
      to: parsed.data.email,
      subject: `Vertrag.ma · Test du service « ${sender.name} »`,
      html: textToHtml(parsed.data.message),
      text: parsed.data.message,
      senderName: "Vertrag.ma",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Remember the failure on the sender (visible in the admin list), but do
    // NOT deactivate it here: a failed test is a diagnostic, the admin
    // decides what to do (the executor deactivates on real failures).
    await MailSender.findByIdAndUpdate(id, {
      $set: { last_error: message.slice(0, 1000), last_error_at: new Date() },
    }).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }

  // Success - record the usage immediately (a test email is a real send).
  const now = new Date();
  await MailSender.findByIdAndUpdate(id, {
    $inc: { usage_count: 1, success_count: 1 },
    $push: { usage_log: { $each: [now], $slice: -5000 } },
  }).catch(() => {});

  await logAdminAction({
    admin_id: auth.user._id,
    admin_email: auth.user.email,
    action: "mail_sender.test",
    entity_type: "mail_sender",
    entity_id: id,
    details: `Email de test envoyé via « ${sender.name} » (${sender.type}) à ${parsed.data.email}`,
  });

  return NextResponse.json({ success: true });
}
