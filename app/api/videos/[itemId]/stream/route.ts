import { NextResponse } from "next/server";
import { requireAdmin, requireStudent } from "@/lib/authorization";
import { canAccessItem } from "@/lib/course-access";
import { db } from "@/lib/db";
import { authedDriveFetch } from "@/lib/drive";
import { DRIVE_ID_REGEX } from "@/lib/drive-urls";
import { logger } from "@/lib/logger";

// Authorized video streaming proxy (M4-S3; docs/DECISIONS.md 2026-07-17).
//
// Why a proxy and not a Drive iframe: a cross-origin Drive /preview embed
// exposes no API to read currentTime or seek, so autosave/resume/completion
// are impossible under it. Feeding a native <video> from here makes them work.
//
// SECURITY: driveFileId is resolved server-side and NEVER sent to the browser
// — the client only ever knows this route's URL. Unauthorized → 404 (not 403),
// so the response can't confirm that an item id exists.
//
// The client's Range header is forwarded to Drive's ?alt=media endpoint and the
// upstream status (206) + range headers are passed straight back, which is what
// makes seeking work.

export const runtime = "nodejs";
// Never cache authorized media at the framework/CDN layer.
export const dynamic = "force-dynamic";

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
] as const;

export async function GET(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;

  // Students must be enrolled to reach the item; admins may preview any item
  // (trusted console; the Drive id is still never exposed — bytes are proxied).
  const student = await requireStudent().catch(() => null);
  if (student) {
    if (!(await canAccessItem(student.student.id, itemId))) {
      return new NextResponse(null, { status: 404 });
    }
  } else {
    const admin = await requireAdmin().catch(() => null);
    if (!admin) return new NextResponse(null, { status: 404 });
  }

  const item = await db.contentItem.findUnique({
    where: { id: itemId },
    select: { type: true, driveFileId: true },
  });
  if (!item || item.type !== "video" || !item.driveFileId) {
    return new NextResponse(null, { status: 404 });
  }
  if (!DRIVE_ID_REGEX.test(item.driveFileId)) {
    logger.warn("stream.bad_drive_id", { itemId });
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.driveFileId)}`,
  );
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const range = req.headers.get("range");
  const upstream = await authedDriveFetch(url, {
    headers: range ? { Range: range } : undefined,
  });

  if (!upstream) {
    logger.warn("stream.no_drive_auth", { itemId });
    return new NextResponse(null, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    // 404 from Drive usually means the file isn't shared with the service
    // account. Log the cause but never echo the id to the client.
    logger.warn("stream.upstream_failed", { itemId, status: upstream.status });
    return new NextResponse(null, { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, no-store");
  // Don't let the browser sniff this into something executable.
  headers.set("x-content-type-options", "nosniff");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
