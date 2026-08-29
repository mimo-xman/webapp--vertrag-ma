// Shared mail-sending core used by both the admin test endpoint (app)
// and the GitHub Actions workflow scripts.
// Supports two sender types: "api" (Brevo REST) and "smtp" (nodemailer).

export interface MailSenderLike {
  _id?: unknown;
  name: string;
  type: "api" | "smtp";
  api_key: string | null;
  smtp_config: {
    host: string;
    port: number;
    username: string;
    password: string;
  } | null;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
  senderEmail?: string;
  senderName?: string;
}

async function sendViaBrevo(
  sender: MailSenderLike,
  options: SendEmailOptions
): Promise<void> {
  if (!sender.api_key) throw new Error(`Le mail sender "${sender.name}" n'a pas de clé API configurée.`);
  const payload: Record<string, unknown> = {
    sender: { email: options.senderEmail || "bewerbung@vertrag.ma", name: options.senderName || "Bewerbung" },
    to: [{ email: options.to }],
    subject: options.subject,
    htmlContent: options.html,
  };
  if (options.text) (payload as { text?: string }).text = options.text;
  if (options.attachments?.length) {
    payload.attachment = options.attachments.map((a) => ({
      content: a.content.toString("base64"),
      name: a.filename,
    }));
  }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": sender.api_key },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API error: ${response.status} - ${errorBody.slice(0, 300)}`);
  }
}

async function sendViaSmtp(
  sender: MailSenderLike,
  options: SendEmailOptions
): Promise<void> {
  if (!sender.smtp_config?.host) {
    throw new Error(`Le mail sender "${sender.name}" n'a pas de configuration SMTP.`);
  }
  const nodemailer = await import("nodemailer");
  const config = sender.smtp_config;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port || 587,
    secure: config.port === 465,
    auth: { user: config.username, pass: config.password },
  });
  const from = options.senderName
    ? `"${options.senderName}" <${config.username}>`
    : config.username;
  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
}

export async function sendViaMailSender(
  sender: MailSenderLike,
  options: SendEmailOptions
): Promise<void> {
  if (sender.type === "api") {
    await sendViaBrevo(sender, options);
  } else if (sender.type === "smtp") {
    await sendViaSmtp(sender, options);
  } else {
    throw new Error(`Type de mail sender invalide : "${sender.type}"`);
  }
}

// Converts a plain text message into simple HTML email body.
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1d21;">${escaped}</div>`;
}
