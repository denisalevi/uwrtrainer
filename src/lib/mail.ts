import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getDictionary, translate, type DictKey } from "@/lib/i18n";

// Outbound email (verification + password-reset links) via any SMTP submission service
// (Brevo, SES, a mailbox…). Configured entirely by env:
//   SMTP_HOST / SMTP_PORT (587) / SMTP_USER / SMTP_PASS / MAIL_FROM / APP_URL
// Unconfigured (no SMTP_HOST) = mail is OFF and the auth flows degrade gracefully:
// signup auto-verifies and password reset is unavailable (see actions/auth.ts).

/** Whether outbound email is configured. Gates the whole verification/reset feature. */
export function mailEnabled(): boolean {
  return !!process.env.SMTP_HOST?.trim();
}

/** Public base URL used in emailed links (the Funnel URL in production). */
export function appUrl(): string {
  const url = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return url || "http://localhost:3000";
}

const globalForMail = globalThis as unknown as { mailTransporter?: Transporter };

function transporter(): Transporter {
  if (!globalForMail.mailTransporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    globalForMail.mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 587/2525 use STARTTLS, negotiated automatically
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return globalForMail.mailTransporter;
}

type MailKind = "verify" | "reset";

const KEYS: Record<MailKind, { subject: DictKey; intro: DictKey; button: DictKey; expiry: DictKey }> = {
  verify: {
    subject: "mail.verifySubject",
    intro: "mail.verifyIntro",
    button: "mail.verifyButton",
    expiry: "mail.verifyExpiry",
  },
  reset: {
    subject: "mail.resetSubject",
    intro: "mail.resetIntro",
    button: "mail.resetButton",
    expiry: "mail.resetExpiry",
  },
};

/**
 * Send a verification / reset link. Throws on SMTP failure — callers decide how to surface
 * that. With mail unconfigured this logs the link instead (local dev convenience; in
 * production the flows never get here because actions check mailEnabled() first).
 */
export async function sendAuthLink(
  kind: MailKind,
  to: { email: string; name: string; locale: string },
  link: string,
): Promise<void> {
  const dict = getDictionary(to.locale);
  const t = (key: DictKey, vars?: Record<string, string | number>) => translate(dict, key, vars);
  const keys = KEYS[kind];

  if (!mailEnabled()) {
    console.log(`[mail disabled] ${kind} link for ${to.email}: ${link}`);
    return;
  }

  const subject = t(keys.subject);
  const greeting = t("mail.greeting", { name: to.name });
  const intro = t(keys.intro);
  const expiry = t(keys.expiry);
  const ignore = t("mail.ignore");

  const text = `${greeting}\n\n${intro}\n\n${link}\n\n${expiry} ${ignore}\n`;
  const html = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px 16px;color:#0f172a">
    <p style="font-size:20px;margin:0 0 16px">🤿 <strong>UWR Trainer</strong></p>
    <p>${greeting}</p>
    <p>${intro}</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600">${t(keys.button)}</a>
    </p>
    <p style="font-size:13px;color:#475569">${expiry} ${ignore}</p>
    <p style="font-size:13px;color:#475569;word-break:break-all">${link}</p>
  </div>`;

  await transporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: to.email,
    subject,
    text,
    html,
  });
}

/** Plain "new member joined" notice to an admin/trainer (see src/lib/notify.ts). */
export async function sendSignupNotice(
  to: { email: string; name: string; locale: string },
  joined: { name: string; email: string; teamNames: string },
): Promise<void> {
  const dict = getDictionary(to.locale);
  const t = (key: DictKey, vars?: Record<string, string | number>) => translate(dict, key, vars);
  const body = t("mail.signupBody", {
    name: joined.name,
    email: joined.email,
    teams: joined.teamNames || "—",
  });

  if (!mailEnabled()) {
    console.log(`[mail disabled] signup notice for ${to.email}: ${body}`);
    return;
  }

  await transporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: to.email,
    subject: t("mail.signupSubject", { name: joined.name }),
    text: `${t("mail.greeting", { name: to.name })}\n\n${body}\n\n${appUrl()}/team\n`,
  });
}
