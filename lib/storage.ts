import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { DomainError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// Supabase Storage via its REST API — no client library (docs/DECISIONS.md).
// Bucket `materials` is private with a server-side 50MB limit + mime
// allowlist; this module re-checks both so bad uploads fail with actionable
// envelopes instead of opaque 4xx bodies. Signed URLs are minted ONLY after
// the caller has passed authorization (admin gate now; canAccessItem in M4).

const MATERIALS_BUCKET = "materials";
const MAX_MATERIAL_BYTES = 50 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 300;

/** Mirrors the bucket's allowed_mime_types — change both together. */
const MATERIAL_MIME_EXT = new Map<string, string>([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-powerpoint", ".ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["text/plain", ".txt"],
  ["application/zip", ".zip"],
]);

const FETCH_TIMEOUT_MS = 10_000; // ARCHITECTURE §6 external-call budget

function storageConfig(): { baseUrl: string; secretKey: string } {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new DomainError(
      "PROVIDER_DOWN",
      "File storage is not configured on this server — set SUPABASE_URL and SUPABASE_SECRET_KEY",
    );
  }
  return { baseUrl: `${SUPABASE_URL}/storage/v1`, secretKey: SUPABASE_SECRET_KEY };
}

function storageFetch(path: string, init: RequestInit): Promise<Response> {
  const { baseUrl, secretKey } = storageConfig();
  const headers = new Headers(init.headers);
  // sb_secret_* keys authenticate via the apikey header; the Authorization
  // header expects a JWT and rejects them ("Invalid Compact JWS") — verified
  // empirically against the live Storage API.
  headers.set("apikey", secretKey);
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export type StoredUpload = {
  storagePath: string;
  mimeType: string;
  originalFileName: string;
};

/**
 * Validates and uploads an admin-provided file to the private bucket.
 * The object key is server-generated (`{uuid}.{ext}`) — the original
 * filename is stored as metadata only and never becomes a path.
 */
export async function uploadMaterial(file: File): Promise<StoredUpload> {
  if (file.size === 0) {
    throw new DomainError("VALIDATION", "The file is empty", { file: "Choose a non-empty file" });
  }
  if (file.size > MAX_MATERIAL_BYTES) {
    throw new DomainError("VALIDATION", "The file exceeds the 50 MB limit", {
      file: "Maximum size is 50 MB",
    });
  }
  const ext = MATERIAL_MIME_EXT.get(file.type);
  if (!ext) {
    throw new DomainError(
      "VALIDATION",
      `Unsupported file type "${file.type || "unknown"}" — allowed: PDF, Office documents, PNG/JPG, TXT, ZIP`,
      { file: "Unsupported file type" },
    );
  }

  const storagePath = `${randomUUID()}${ext}`;
  const res = await storageFetch(`/object/${MATERIALS_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { "content-type": file.type, "x-upsert": "false" },
    body: file,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error("storage.upload_failed", { status: res.status, body: body.slice(0, 300) });
    throw new DomainError("PROVIDER_DOWN", "File storage rejected the upload — try again");
  }
  return { storagePath, mimeType: file.type, originalFileName: file.name };
}

/**
 * Mints a short-lived signed URL for a stored object. Callers MUST have
 * passed authorization first — this function trusts its caller.
 */
export async function createSignedMaterialUrl(
  storagePath: string,
  expiresInSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const res = await storageFetch(`/object/sign/${MATERIALS_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error("storage.sign_failed", { status: res.status, body: body.slice(0, 300) });
    throw new DomainError("PROVIDER_DOWN", "Could not generate a file link — try again");
  }
  const json = (await res.json()) as { signedURL?: string };
  if (!json.signedURL) {
    throw new DomainError("PROVIDER_DOWN", "Could not generate a file link — try again");
  }
  const { baseUrl } = storageConfig();
  return `${baseUrl}${json.signedURL}`;
}

/**
 * Best-effort bulk removal of stored objects after a hard delete committed.
 * Never throws — a leaked object is an orphan, not a broken delete.
 */
export async function deleteMaterialObjects(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  try {
    const res = await storageFetch(`/object/${MATERIALS_BUCKET}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: storagePaths }),
    });
    if (!res.ok) {
      logger.error("storage.bulk_delete_failed", {
        status: res.status,
        count: storagePaths.length,
      });
    }
  } catch (cause) {
    logger.error("storage.bulk_delete_error", {
      count: storagePaths.length,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
