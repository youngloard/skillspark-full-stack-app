import "server-only";
import { db } from "@/lib/db";
import { canAccessItem } from "@/lib/course-access";
import { createSignedMaterialUrl } from "@/lib/storage";

// Signed-URL minting for upload materials (M4-S4) — the only server-side piece
// the content proxy needs. Fail-closed via canAccessItem (the security
// boundary); the pure view/download link logic lives in lib/material-links.ts.

export type SignedMaterial = {
  signedUrl: string;
  mimeType: string | null;
  originalFileName: string | null;
  downloadEnabled: boolean;
};

/**
 * Gate (canAccessItem) then mint a FRESH signed URL for an upload material.
 * Called per-request by the content proxy, so an expired URL is never reused —
 * the next request simply mints another. Returns null when access is denied or
 * the item isn't an upload material.
 */
export async function mintMaterialSignedUrl(
  studentId: string,
  itemId: string,
): Promise<SignedMaterial | null> {
  if (!(await canAccessItem(studentId, itemId))) return null;

  const item = await db.contentItem.findUnique({
    where: { id: itemId },
    select: {
      type: true,
      sourceType: true,
      storagePath: true,
      mimeType: true,
      originalFileName: true,
      downloadEnabled: true,
    },
  });

  if (!item || item.type !== "material" || item.sourceType !== "upload" || !item.storagePath) {
    return null;
  }

  const signedUrl = await createSignedMaterialUrl(item.storagePath);
  return {
    signedUrl,
    mimeType: item.mimeType,
    originalFileName: item.originalFileName,
    downloadEnabled: item.downloadEnabled,
  };
}
