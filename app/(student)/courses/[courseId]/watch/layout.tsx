import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WatchShell } from "@/components/student/watch/watch-shell";
import { requireStudent } from "@/lib/authorization";
import { getCourseDetail } from "@/lib/course-detail";
import { getCourseProgress } from "@/lib/course-progress";

// Persistent watch shell (M4-S3): fetched once per course, kept mounted across
// lesson navigations so the sidebar never re-renders. Only the [itemId] page
// below swaps (docs/DECISIONS.md 2026-07-17).

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

export default async function WatchLayout({
  params,
  children,
}: {
  params: Promise<{ courseId: string }>;
  children: React.ReactNode;
}) {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const { courseId } = await params;
  const [course, progress] = await Promise.all([
    getCourseDetail(ctx.student.id, courseId),
    getCourseProgress(ctx.student.id, courseId),
  ]);
  if (!course) notFound();

  const tree = {
    courseId: course.id,
    modules: course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      items: m.items.map((i) => ({ id: i.id, title: i.title, type: i.type, duration: i.duration })),
    })),
    flatItems: course.items.map((i) => ({
      id: i.id,
      title: i.title,
      type: i.type,
      duration: i.duration,
    })),
  };

  const durations: Record<string, number | null> = {};
  for (const m of course.modules) for (const i of m.items) durations[i.id] = i.duration;
  for (const i of course.items) durations[i.id] = i.duration;

  return (
    <div className="w-full px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <Link
        href={`/courses/${course.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <Chevron className="h-4 w-4 rotate-90" />
        {course.name}
      </Link>

      <WatchShell tree={tree} initialProgress={progress} durations={durations}>
        {children}
      </WatchShell>
    </div>
  );
}
