import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/authorization";
import { saveVideoProgress } from "@/lib/video-progress";

// Progress sink for the player (M4-S3; docs/DECISIONS.md 2026-07-17).
//
// Why a route handler and not a Server Action: a Server Action re-renders the
// route's Server Components on every call, so the watch page would re-feed the
// player its initial position mid-playback and visibly re-seek. This also has
// to be callable by navigator.sendBeacon on unload, which cannot invoke actions.
//
// Best-effort by design: unauthorized / malformed posts drop silently to 204 so
// an unload beacon never surfaces an error. Object-level access is still
// enforced on every write (inside saveVideoProgress), and `completed` is
// computed server-side from the stored duration — never trusted from here.

export const runtime = "nodejs";

const schema = z.object({
  itemId: z.string().min(1).max(64),
  positionSeconds: z.coerce
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 24),
  ended: z.boolean().optional(),
  // Whole seconds actually played since the last ping (seeks excluded). Clamped
  // so a bad client can't inflate watch time beyond one heartbeat's worth.
  watchedDelta: z.coerce.number().int().min(0).max(3600).optional(),
});

export async function POST(req: Request) {
  const student = await requireStudent().catch(() => null);
  if (!student) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    // sendBeacon posts a Blob; json() handles it as long as the body is JSON.
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  await saveVideoProgress({
    studentId: student.student.id,
    itemId: parsed.data.itemId,
    positionSeconds: parsed.data.positionSeconds,
    ended: parsed.data.ended,
    watchedDelta: parsed.data.watchedDelta,
  });

  return new NextResponse(null, { status: 204 });
}
