import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MaterialRow } from "@/components/student/material-row";
import { requireStudent } from "@/lib/authorization";
import {
  getCourseDetail,
  type CourseDetailItem,
  type CourseDetailModule,
} from "@/lib/course-detail";
import { getCourseProgress, type ItemProgress } from "@/lib/course-progress";

// Course detail (M4-S2). Editorial per DESIGN.md §14 — a course header, then
// the content as ledger-style rows (hairline separators, not a card-stack):
// module layout uses native <details> accordions, flat layout a single list.

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

// One item row: a video links to the watch page (with progress); a material is
// rendered inline with View / Download actions (no separate viewer page).
function ItemRow({
  courseId,
  item,
  progress,
}: {
  courseId: string;
  item: CourseDetailItem;
  progress?: ItemProgress;
}) {
  if (item.type !== "video") {
    return <MaterialRow material={item} />;
  }

  const done = progress?.completed === true;
  const pct =
    item.duration && item.duration > 0 && progress
      ? Math.min(100, Math.round((progress.positionSeconds / item.duration) * 100))
      : 0;
  const inProgress = !done && pct > 0;

  return (
    <Link
      href={`/courses/${courseId}/watch/${item.id}`}
      className="group flex items-center gap-4 rounded-md px-3 py-4 transition-colors hover:bg-surface-2/60"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          done ? "bg-accent text-accent-fg" : "bg-accent/10 text-accent"
        }`}
      >
        {done ? <CheckIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-fg transition-colors group-hover:text-accent">
          {item.title}
        </p>
        {item.description ? (
          <p className="truncate text-sm text-fg-muted">{item.description}</p>
        ) : null}
        {inProgress ? (
          <span className="mt-2 flex max-w-xs items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span className="tabular shrink-0 text-[11px] text-accent">{pct}%</span>
          </span>
        ) : null}
      </div>
      {item.duration ? (
        <span className="tabular shrink-0 text-sm text-fg-subtle">
          {formatDuration(item.duration)}
        </span>
      ) : null}
    </Link>
  );
}

function ModuleBlock({
  courseId,
  module,
  defaultOpen,
  progress,
}: {
  courseId: string;
  module: CourseDetailModule;
  defaultOpen: boolean;
  progress: Record<string, ItemProgress>;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-fg">{module.title}</h3>
          {module.description ? (
            <p className="mt-0.5 truncate text-sm text-fg-muted">{module.description}</p>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-3 text-fg-subtle">
          <span className="tabular text-xs">
            {module.items.length} {module.items.length === 1 ? "item" : "items"}
          </span>
          <Chevron className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-1.5 pb-4">
        {module.items.map((item) => (
          <ItemRow key={item.id} courseId={courseId} item={item} progress={progress[item.id]} />
        ))}
      </div>
    </details>
  );
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const { courseId } = await params;
  const course = await getCourseDetail(ctx.student.id, courseId);
  if (!course) notFound();

  const progress = await getCourseProgress(ctx.student.id, courseId);
  const videoItems = [...course.modules.flatMap((m) => m.items), ...course.items].filter(
    (i) => i.type === "video",
  );
  const doneCount = videoItems.filter((i) => progress[i.id]?.completed).length;
  const overallPct = videoItems.length > 0 ? Math.round((doneCount / videoItems.length) * 100) : 0;

  const summary = [
    course.moduleCount > 0
      ? `${course.moduleCount} ${course.moduleCount === 1 ? "module" : "modules"}`
      : null,
    course.videoCount > 0
      ? `${course.videoCount} ${course.videoCount === 1 ? "lesson" : "lessons"}`
      : null,
    course.materialCount > 0
      ? `${course.materialCount} ${course.materialCount === 1 ? "material" : "materials"}`
      : null,
  ].filter(Boolean);

  const isEmpty = course.modules.length === 0 && course.items.length === 0;

  return (
    <div className="w-full px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <Link
        href="/courses"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <Chevron className="h-4 w-4 rotate-90" />
        My courses
      </Link>

      <header className="mt-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">
          {course.layout === "flat" ? "Materials" : "Course"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-balance text-fg">
          {course.name}
        </h1>
        {course.description ? (
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{course.description}</p>
        ) : null}
        {summary.length > 0 ? (
          <p className="tabular mt-4 text-sm text-fg-subtle">{summary.join(" · ")}</p>
        ) : null}
        {videoItems.length > 0 ? (
          <div className="mt-5 max-w-md">
            <div className="flex items-baseline justify-between gap-3">
              <span className="tabular text-xs text-fg-subtle">
                {doneCount} / {videoItems.length} lessons complete
              </span>
              <span className="tabular text-xs font-semibold text-accent">{overallPct}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        ) : null}
      </header>

      <div className="mt-8">
        {isEmpty ? (
          <p className="border-t border-line pt-6 text-sm text-fg-muted">
            No content has been added to this course yet — check back soon.
          </p>
        ) : course.modules.length > 0 ? (
          <div className="border-t border-line">
            {course.modules.map((module, i) => (
              <ModuleBlock
                key={module.id}
                courseId={course.id}
                module={module}
                defaultOpen={i === 0}
                progress={progress}
              />
            ))}
          </div>
        ) : (
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Contents
            </h2>
            <div className="space-y-1.5 border-t border-line pt-3">
              {course.items.map((item) => (
                <ItemRow
                  key={item.id}
                  courseId={course.id}
                  item={item}
                  progress={progress[item.id]}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
