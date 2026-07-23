import "server-only";
import { getDriveAccessToken } from "@/lib/drive-auth";
import { DRIVE_ID_REGEX } from "@/lib/drive-urls";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Drive metadata access (server half of the reference app's lib/drive.ts).
// Prefers the service account (works for restricted files); falls back to the
// API key (public-link files only). Callers on the request path never wait on
// this — duration fetch runs as a Job (lib/drive-jobs.ts).

export type DriveFileMeta = {
  durationSeconds: number | null;
  name: string | null;
  mimeType: string | null;
};

function hasDriveAuth(): boolean {
  return !!env().GOOGLE_SERVICE_ACCOUNT_JSON || !!env().GOOGLE_DRIVE_API_KEY;
}

/**
 * Authenticated request to a Drive API URL: bearer token when the service
 * account works, `key=` query fallback otherwise, null when neither exists.
 * Exported at M4-S3 — the watch page's streaming proxy is the consumer this
 * was written for (docs/DECISIONS.md 2026-07-17).
 */
export async function authedDriveFetch(url: URL, init?: RequestInit): Promise<Response | null> {
  const token = await getDriveAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    const apiKey = env().GOOGLE_DRIVE_API_KEY;
    if (!apiKey) return null;
    if (!url.searchParams.has("key")) url.searchParams.set("key", apiKey);
  }
  return fetch(url.toString(), { ...init, headers, cache: "no-store" });
}

/**
 * Fetches Drive metadata for a file. Returns null on any failure — never
 * throws — callers decide whether null is retryable.
 */
export async function fetchDriveVideoMetadata(fileId: string): Promise<DriveFileMeta | null> {
  if (!fileId || !DRIVE_ID_REGEX.test(fileId)) return null;
  if (!hasDriveAuth()) {
    logger.warn("drive.no_auth_configured", { fileId });
    return null;
  }
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "videoMediaMetadata,name,mimeType");
  // Service-account fetches need explicit opt-in for shared-drive files.
  url.searchParams.set("supportsAllDrives", "true");
  try {
    const res = await authedDriveFetch(url);
    if (!res || !res.ok) {
      logger.warn("drive.metadata_fetch_failed", { fileId, status: res?.status ?? "no-auth" });
      return null;
    }
    const json = (await res.json()) as {
      name?: string;
      mimeType?: string;
      videoMediaMetadata?: { durationMillis?: string | number };
    };
    let durationSeconds: number | null = null;
    const ms = json.videoMediaMetadata?.durationMillis;
    if (ms !== undefined && ms !== null) {
      const n = typeof ms === "string" ? Number(ms) : ms;
      if (Number.isFinite(n) && n >= 0) durationSeconds = Math.round(n / 1000);
    }
    return {
      durationSeconds,
      name: json.name ?? null,
      mimeType: json.mimeType ?? null,
    };
  } catch (cause) {
    logger.warn("drive.metadata_fetch_error", {
      fileId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}
