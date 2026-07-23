import Link from "next/link";
import type { CourseProgressSummary } from "@/lib/course-progress";
import type { Course } from "@/lib/generated/prisma/client";

// A course "poster" card (student side, DESIGN.md §8). Cover image when the
// admin set one, else a course monogram (the initial in display type). Shows a
// completion bar when the course has lessons and progress is supplied (M4-S3).
// Links to the course detail (M4-S2).

export function CourseCard({
  course,
  progress,
}: {
  course: Course;
  progress?: CourseProgressSummary;
}) {
  const kicker = course.layout === "flat" ? "Materials" : "Course";
  const initial = (course.name.trim().charAt(0) || "•").toUpperCase();
  const showProgress = progress !== undefined && progress.total > 0;

  return (
    <Link
      href={`/courses/${course.id}`}
      className="group block overflow-hidden rounded-lg border border-line bg-surface transition duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_20px_45px_-28px_rgba(2,20,20,0.35)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {course.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external admin URLs; no next/image domain config
          <img
            src={course.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <span className="select-none font-display text-6xl font-semibold text-accent/30 transition-colors duration-200 group-hover:text-accent/45">
              {initial}
            </span>
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-subtle">
          {kicker}
        </p>
        <h3 className="mt-1.5 font-display text-[1.05rem] font-semibold leading-snug text-fg transition-colors group-hover:text-accent">
          {course.name}
        </h3>
        {course.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-fg-muted">
            {course.description}
          </p>
        ) : null}
        {showProgress ? (
          <div className="mt-4">
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="tabular mt-1.5 text-[11px] text-fg-subtle">
              {progress.completed === progress.total
                ? "Completed"
                : `${progress.completed} / ${progress.total} lessons · ${progress.percent}%`}
            </p>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
