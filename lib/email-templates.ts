// Email bodies (M8). Pure and client-safe so the admin dialog can preview the
// exact HTML that will be sent. Table-based layout with inline styles — email
// clients ignore <style> blocks and modern CSS. The platform URL is injected by
// the caller (it lives in server env).

export type EmailTemplateId = "welcome" | "custom";

export type RenderedEmail = { subject: string; html: string; text: string };

const BRAND = "#0d9488"; // teal accent, matching the console
const INK = "#0b1f1f";
const MUTED = "#5b6b6b";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wraps body content in the branded shell (header, card, footer). */
function shell(bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f7f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #e6eceb;">
          <span style="font-size:17px;font-weight:700;color:${INK};letter-spacing:-0.01em;">Skill<span style="color:${BRAND};">Spark</span></span>
        </td></tr>
        <tr><td style="padding:28px;color:${INK};font-size:15px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e6eceb;color:${MUTED};font-size:12px;line-height:1.5;">
          You're receiving this because you're enrolled at SkillSpark.<br/>
          Questions? Just reply to this email and your coordinator will help.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr><td style="border-radius:8px;background:${BRAND};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

/** Welcome / how-to-sign-in email. */
export function renderWelcomeEmail(params: {
  studentName: string;
  studentEmail: string;
  platformUrl: string;
}): RenderedEmail {
  const { studentName, studentEmail, platformUrl } = params;
  const firstName = studentName.trim().split(/\s+/)[0] || "there";

  const html = shell(`
    <p style="margin:0 0 14px;font-size:19px;font-weight:600;">Welcome, ${escapeHtml(firstName)} 👋</p>
    <p style="margin:0 0 14px;">Your SkillSpark account is ready. You can now watch your course videos, download study material, and take your JET practice exams — all in one place.</p>
    <p style="margin:0 0 6px;font-weight:600;">How to sign in</p>
    <ol style="margin:0 0 4px;padding-left:20px;color:${INK};">
      <li style="margin-bottom:6px;">Open <a href="${escapeHtml(platformUrl)}" style="color:${BRAND};">${escapeHtml(platformUrl.replace(/^https?:\/\//, ""))}</a></li>
      <li style="margin-bottom:6px;">Click <strong>Continue with Google</strong></li>
      <li style="margin-bottom:6px;">Choose the Google account for <strong>${escapeHtml(studentEmail)}</strong></li>
    </ol>
    ${button(platformUrl, "Open SkillSpark")}
    <p style="margin:0 0 10px;color:${MUTED};font-size:13px;">Use that exact email address — it's the one your coordinator registered, and sign-in won't work with a different account. There's no password to remember; Google handles it.</p>
  `);

  const text = [
    `Welcome, ${firstName}!`,
    ``,
    `Your SkillSpark account is ready. You can watch your course videos, download study material, and take your JET practice exams.`,
    ``,
    `How to sign in:`,
    `1. Open ${platformUrl}`,
    `2. Click "Continue with Google"`,
    `3. Choose the Google account for ${studentEmail}`,
    ``,
    `Use that exact email address - it's the one your coordinator registered. There's no password to remember.`,
    ``,
    `Questions? Just reply to this email.`,
  ].join("\n");

  return { subject: "Your SkillSpark account is ready", html, text };
}

/** Free-form message from an admin, in the same branded shell. */
export function renderCustomEmail(params: {
  studentName: string;
  subject: string;
  message: string;
  platformUrl: string;
}): RenderedEmail {
  const firstName = params.studentName.trim().split(/\s+/)[0] || "there";
  const paragraphs = params.message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const html = shell(`
    <p style="margin:0 0 14px;font-size:17px;font-weight:600;">Hi ${escapeHtml(firstName)},</p>
    ${paragraphs}
    ${button(params.platformUrl, "Open SkillSpark")}
  `);

  const text = `Hi ${firstName},\n\n${params.message}\n\nOpen SkillSpark: ${params.platformUrl}`;

  return { subject: params.subject, html, text };
}
