import "server-only";
import { createSign } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Google service-account auth for Drive (behavior port of the reference
// app's lib/drive-auth.ts). A bare API key can only read "anyone with link"
// files; the service account works for files shared with its email. The
// server signs a JWT with the SA key and exchanges it for an access token.
// Token cached until ~60s before expiry; concurrent callers share one
// in-flight exchange.

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

let cachedSa: ServiceAccount | null | undefined;
let cachedToken: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (cachedSa !== undefined) return cachedSa;
  const raw = env().GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    cachedSa = null;
    return null;
  }
  try {
    const obj = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown };
    const email = typeof obj.client_email === "string" ? obj.client_email : null;
    const key = typeof obj.private_key === "string" ? obj.private_key : null;
    if (!email || !key) {
      cachedSa = null;
      return null;
    }
    // The key may arrive with escaped \n depending on how the env was set.
    cachedSa = { client_email: email, private_key: key.replace(/\\n/g, "\n") };
    return cachedSa;
  } catch {
    logger.error("drive_auth.sa_parse_failed", {
      message: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON",
    });
    cachedSa = null;
    return null;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function exchangeJwtForToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  let signature: Buffer;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    signature = signer.sign(sa.private_key);
  } catch (cause) {
    logger.error("drive_auth.jwt_sign_failed", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
  const jwt = `${signingInput}.${base64url(signature)}`;

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      cache: "no-store",
    });
  } catch (cause) {
    logger.warn("drive_auth.token_network_error", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
  if (!res.ok) {
    logger.warn("drive_auth.token_exchange_failed", { status: res.status });
    return null;
  }
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!json?.access_token) {
    logger.warn("drive_auth.token_response_invalid", {});
    return null;
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000, // 60s margin
  };
  return cachedToken.token;
}

/**
 * Returns a valid access token, or null if no service account is configured
 * or the exchange failed (logged, never thrown).
 */
export async function getDriveAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  if (inflight) return inflight;
  const sa = loadServiceAccount();
  if (!sa) return null;
  inflight = exchangeJwtForToken(sa).finally(() => {
    inflight = null;
  });
  return inflight;
}
