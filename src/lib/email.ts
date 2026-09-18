// Transactional emails via Brevo REST API (account confirmation, password reset, etc.)
// In development without BREVO_API_KEY, emails are logged to the console instead of failing.

const APP_NAME = "Vertrag.ma";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export interface BrevoEmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  apiKey?: string;
}

function emailEnabled(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export async function sendEmailBrevo(options: BrevoEmailOptions): Promise<void> {
  const apiKey = options.apiKey || process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@vertrag.ma";

  if (!apiKey || !senderEmail) {
    console.log(
      `[EMAIL:DEV] To: ${options.to} | Subject: ${options.subject}\n${options.htmlContent.replace(/<[^>]+>/g, " ").slice(0, 300)}`
    );
    return;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: APP_NAME },
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.htmlContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API error: ${response.status} - ${errorBody}`);
  }
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f2ec;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border:1px solid #d8d5cc;">
    <div style="background:#1e4475;padding:20px 28px;">
      <span style="color:#f4f2ec;font-size:20px;font-weight:700;letter-spacing:0.5px;">Vertrag<span style="color:#e8b04b;">.ma</span></span>
    </div>
    <div style="padding:28px;color:#1a1d21;font-size:15px;line-height:1.6;">${content}</div>
    <div style="padding:16px 28px;border-top:1px solid #d8d5cc;color:#71757c;font-size:12px;">
      Vertrag.ma — Votre passerelle vers l'emploi en Allemagne.
    </div>
  </div>
</body></html>`;
}

function button(url: string, label: string, color = "#1e4475"): string {
  return `<div style="margin:24px 0;"><a href="${url}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 28px;font-weight:600;border-radius:2px;font-size:14px;">${label}</a></div>
  <p style="color:#71757c;font-size:12px;">Si le bouton ne fonctionne pas, copiez ce lien :<br><span style="font-family:monospace;word-break:break-all;">${url}</span></p>`;
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const url = `${APP_URL}/verify-email?token=${token}`;
  await sendEmailBrevo({
    to: email,
    subject: `${APP_NAME} — Activez votre compte`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 12px;">Bienvenue chez Vertrag.ma</h2>
      <p>Merci pour votre inscription. Cliquez sur le bouton ci-dessous pour activer votre compte. Ce lien expire dans <strong>24 heures</strong>.</p>
      ${button(url, "Activer mon compte")}
    `),
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${resetToken}`;
  await sendEmailBrevo({
    to: email,
    subject: `${APP_NAME} — Réinitialisation du mot de passe`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 12px;">Réinitialisation du mot de passe</h2>
      <p>Vous avez demandé la réinitialisation de votre mot de passe. Ce lien expire dans <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      ${button(url, "Réinitialiser le mot de passe")}
    `),
  });
}

export async function sendDeleteAccountEmail(email: string, deletionToken: string): Promise<void> {
  const url = `${APP_URL}/delete-account-confirm?token=${deletionToken}`;
  await sendEmailBrevo({
    to: email,
    subject: `${APP_NAME} — Confirmer la suppression du compte`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 12px;color:#b3391f;">Suppression du compte</h2>
      <p>Vous avez demandé la <strong>suppression définitive</strong> de votre compte. Toutes vos données seront effacées. Cette action est irréversible. Ce lien expire dans <strong>1 heure</strong>.</p>
      ${button(url, "Oui, supprimer mon compte", "#b3391f")}
    `),
  });
}

export async function send2faDisableEmail(email: string, token: string): Promise<void> {
  const url = `${APP_URL}/api/auth/2fa/disable-by-email?token=${token}`;
  await sendEmailBrevo({
    to: email,
    subject: `${APP_NAME} — Désactivation de la double authentification`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 12px;">Désactivation du 2FA</h2>
      <p>Vous avez demandé la désactivation de la double authentification (2FA). Cliquez ci-dessous pour confirmer. Ce lien expire dans <strong>1 heure</strong>.</p>
      ${button(url, "Désactiver le 2FA")}
    `),
  });
}

// Generic sendEmail wrapper
export async function sendEmail(options: BrevoEmailOptions): Promise<void> {
  await sendEmailBrevo(options);
}
