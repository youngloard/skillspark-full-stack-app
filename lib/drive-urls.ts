// Google Drive URL parsing + derivation. Pure and client-safe — the server
// stores only the bare file ID (canonical, DECISIONS/reference rule); every
// URL is derived at render time. Behavior-parity port of the reference app's
// lib/drive.ts parsing half.

export const DRIVE_ID_REGEX = /^[A-Za-z0-9_-]{10,128}$/;

const URL_PATTERNS: RegExp[] = [
  // /file/d/{id}/...
  /\/file\/d\/([A-Za-z0-9_-]{10,128})(?:[/?#]|$)/,
  // /document/d/{id}/...
  /\/document\/d\/([A-Za-z0-9_-]{10,128})(?:[/?#]|$)/,
  // ?id={id} or &id={id}
  /[?&]id=([A-Za-z0-9_-]{10,128})(?:[&#]|$)/,
  // /uc/{id}/... (rare)
  /\/uc\/([A-Za-z0-9_-]{10,128})(?:[/?#]|$)/,
];

/**
 * Returns the Drive file ID, or null if `input` doesn't look like one.
 * Accepts bare IDs and the common Drive URL shapes admins paste.
 */
export function parseDriveFileId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (DRIVE_ID_REGEX.test(trimmed)) return trimmed;
  for (const re of URL_PATTERNS) {
    const m = trimmed.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function buildDriveEmbedUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function buildDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function buildDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}
