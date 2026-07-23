import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/authorization";
import { db } from "@/lib/db";
import { mintMaterialSignedUrl } from "@/lib/material-view";
import { logger } from "@/lib/logger";

// Material content proxy (M4-S4). Same-origin so the viewer's <iframe>/<img>
// can embed upload materials without a cross-origin signed URL leaking to the
// browser. Gate (requireStudent + canAccessItem, inside mintMaterialSignedUrl)
// → mint a fresh signed URL server-side → stream the bytes back.
//
// Inline by default (view in place). Attachment disposition ONLY when the
// caller asks (?download=1) AND the item is downloadEnabled — otherwise the
// "no overt download" rule stands (honest access control, not DRM).
//
// Unauthorized → 404 (not 403), so the response can't confirm an item exists.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASSTHROUGH_HEADERS = ["content-type", "content-length", "last-modified", "etag"] as const;

export async function GET(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;

  const student = await requireStudent().catch(() => null);
  if (!student) return new NextResponse(null, { status: 404 });

  const material = await mintMaterialSignedUrl(student.student.id, itemId);
  if (!material) return new NextResponse(null, { status: 404 });

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
  const asAttachment = wantsDownload && material.downloadEnabled;

  // Log real downloads (not inline views) for the admin download-count analytics
  // (M6-S3). Best-effort — never fail or delay the download if logging trips.
  if (asAttachment) {
    try {
      await db.materialDownload.create({ data: { itemId, studentId: student.student.id } });
    } catch {
      logger.warn("material.download_log_failed", { itemId });
    }
  }

  const upstream = await fetch(material.signedUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    logger.warn("material.upstream_failed", { itemId, status: upstream.status });
    return new NextResponse(null, { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (material.mimeType) headers.set("content-type", material.mimeType);
  const safeName = (material.originalFileName ?? "material").replace(/["\\\r\n]/g, "");
  headers.set(
    "content-disposition",
    `${asAttachment ? "attachment" : "inline"}; filename="${safeName}"`,
  );
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");

  return new NextResponse(upstream.body, { status: 200, headers });
}
