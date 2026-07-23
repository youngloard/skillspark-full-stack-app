import { notFound, redirect } from "next/navigation";
import { MaterialRow } from "@/components/student/material-row";
import { WatchPlayer } from "@/components/student/watch/watch-player";
import { WatchProgressBadge } from "@/components/student/watch/watch-progress-badge";
import { requireStudent } from "@/lib/authorization";
import { getWatchItem } from "@/lib/watch";

// The swappable half of the watch page (M4-S3) — just the current lesson. The
// back link + sidebar live in the persistent layout, so navigating between
// lessons re-renders only this. Per-video notes are listed inline with View /
// Download actions (no separate viewer page). SECURITY: no driveFileId for the
// video itself; the player only knows the authorized stream URL.

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ courseId: string; itemId: string }>;
}) {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const { courseId, itemId } = await params;
  const data = await getWatchItem(ctx.student.id, courseId, itemId);
  if (!data) notFound();

  const { item, attachments, progress } = data;

  return (
    <>
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-[0_24px_60px_-30px_rgba(2,20,20,0.7)]">
        <WatchPlayer itemId={item.id} initialPosition={progress?.positionSeconds ?? 0} />
      </div>

      <header className="mt-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance text-fg">
          {item.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-subtle">
          {item.duration ? <span className="tabular">{formatDuration(item.duration)}</span> : null}
          <WatchProgressBadge itemId={item.id} duration={item.duration} />
        </div>
        {item.description ? (
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{item.description}</p>
        ) : null}
      </header>

      {attachments.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Lesson materials
          </h2>
          <div className="space-y-1.5 border-t border-line pt-3">
            {attachments.map((a) => (
              <MaterialRow key={a.id} material={a} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
