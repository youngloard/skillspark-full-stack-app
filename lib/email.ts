import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Transactional email transport (M8) — ZeptoMail HTTP API. Chosen over SMTP so
// there's no connection pool to keep warm and no extra dependency: one bounded
// fetch per message. Never throws: callers get a result envelope so one bad
// address can't abort a bulk send. Logs carry counts/status only — never the
// token and never a recipient address (PII stays in the audit log).

export type EmailRecipient = { email: string; name?: string | null };

export type SendEmailResult = { ok: true } | { ok: false; error: string };

const SEND_TIMEOUT_MS = 15_000;

/** True when the mail service is configured; the UI disables sending otherwise. */
export function isEmailConfigured(): boolean {
  const e = env();
  return Boolean(e.ZEPTOMAIL_TOKEN && e.EMAIL_FROM_ADDRESS);
}

export async function sendEmail(params: {
  to: EmailRecipient;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  const e = env();
  if (!e.ZEPTOMAIL_TOKEN || !e.EMAIL_FROM_ADDRESS) {
    return { ok: false, error: "Email is not configured on this server" };
  }

  const payload = {
    from: { address: e.EMAIL_FROM_ADDRESS, name: e.EMAIL_FROM_NAME },
    to: [
      {
        email_address: {
          address: params.to.email,
          ...(params.to.name ? { name: params.to.name } : {}),
        },
      },
    ],
    subject: params.subject,
    htmlbody: params.html,
    ...(params.text ? { textbody: params.text } : {}),
  };

  try {
    const res = await fetch(e.ZEPTOMAIL_API_URL, {
      method: "POST",
      headers: {
        // The token already carries its "Zoho-enczapikey " scheme prefix.
        Authorization: e.ZEPTOMAIL_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Body may carry the provider's reason; keep it out of the client message.
      const detail = await res.text().catch(() => "");
      logger.warn("email.send_rejected", { status: res.status, detail: detail.slice(0, 300) });
      return {
        ok: false,
        error:
          res.status === 401 || res.status === 403
            ? "Mail service rejected the credentials"
            : `Mail service error (${res.status})`,
      };
    }
    return { ok: true };
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    logger.warn("email.send_failed", { timedOut });
    return {
      ok: false,
      error: timedOut ? "Mail service timed out" : "Could not reach the mail service",
    };
  }
}
