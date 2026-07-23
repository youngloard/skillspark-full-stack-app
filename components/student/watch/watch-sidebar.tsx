"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWatchProgress } from "./progress-context";

// Persistent course-content sidebar (M4-S3). Lives in the watch layout, so it
// does NOT re-render when the student moves between lessons — only the current
// lesson (from the URL) and the live progress (from the store) change. Shows
// per-lesson completion / in-progress %, plus an overall course-progress bar.

export type SidebarItem = { id: string; title: string; type: string; duration: number | null };
export type SidebarTree = {
  courseId: string;
  modules: { id: string; title: string; items: SidebarItem[] }[];
  flatItems: SidebarItem[];
};

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function WatchSidebar({ tree }: { tree: SidebarTree }) {
  const pathname = usePathname();
  const currentId = pathname.split("/").pop() ?? "";
  const { map } = useWatchProgress();

  const videos = [...tree.modules.flatMap((m) => m.items), ...tree.flatItems].filter(
    (i) => i.type === "video",
  );
  const done = videos.filter((i) => map[i.id]?.completed).length;
  const pct = videos.length > 0 ? Math.round((done / videos.length) * 100) : 0;

  return (
    <div className="lg:flex lg:h-full lg:flex-col">
      <div className="mb-5 lg:shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Course content
          </h2>
          <span className="tabular text-xs text-fg-subtle">
            {done} / {videos.length}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="tabular mt-1.5 text-[11px] text-fg-subtle">{pct}% complete</p>
      </div>

      {/* The scroll region: a long lesson list scrolls here, not the page.
          Scrollbar hidden (still scrollable) per owner preference. */}
      <div className="scrollbar-none lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {tree.modules.length > 0 ? (
          <div className="space-y-5">
            {tree.modules.map((m, mi) => (
              <details key={m.id} open={m.items.some((i) => i.id === currentId)} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-baseline gap-2.5">
                    <span className="tabular shrink-0 text-[11px] text-fg-subtle">
                      {String(mi + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-fg">
                      {m.title}
                    </span>
                  </span>
                  <Chevron className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="mt-1.5 space-y-1.5">
                  {m.items.map((i, ii) => (
                    <Row
                      key={i.id}
                      courseId={tree.courseId}
                      item={i}
                      index={ii + 1}
                      current={i.id === currentId}
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {tree.flatItems.map((i, ii) => (
              <Row
                key={i.id}
                courseId={tree.courseId}
                item={i}
                index={ii + 1}
                current={i.id === currentId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  courseId,
  item,
  index,
  current,
}: {
  courseId: string;
  item: SidebarItem;
  index: number;
  current: boolean;
}) {
  const { map } = useWatchProgress();
  const isVideo = item.type === "video";
  const p = map[item.id];
  const done = p?.completed === true;
  const pct =
    isVideo && item.duration && item.duration > 0 && p
      ? Math.min(100, Math.round((p.positionSeconds / item.duration) * 100))
      : 0;
  const inProgress = isVideo && !done && pct > 0;

  const href = isVideo
    ? `/courses/${courseId}/watch/${item.id}`
    : `/courses/${courseId}/materials/${item.id}`;

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`group/row flex items-start gap-3 rounded-md px-3 py-3 transition-colors ${
        current ? "bg-accent/10" : "hover:bg-surface-2"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        {done ? (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg">
            <CheckIcon className="h-3 w-3" />
          </span>
        ) : (
          <span
            className={`tabular grid h-5 w-5 place-items-center rounded-full text-[11px] ${
              current ? "bg-accent/15 font-semibold text-accent" : "text-fg-subtle"
            }`}
          >
            {String(index).padStart(2, "0")}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm leading-snug ${
            current
              ? "font-semibold text-accent"
              : "text-fg-muted transition-colors group-hover/row:text-fg"
          }`}
        >
          {item.title}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
          <span>{isVideo ? "Lesson" : "Material"}</span>
          {item.duration ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular">{fmt(item.duration)}</span>
            </>
          ) : null}
          {inProgress ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular text-accent">{pct}%</span>
            </>
          ) : null}
        </span>
        {inProgress ? (
          <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
