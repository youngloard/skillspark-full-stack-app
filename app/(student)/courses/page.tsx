import { redirect } from "next/navigation";
import { CourseCard } from "@/components/student/course-card";
import { requireStudent } from "@/lib/authorization";
import { getAccessibleCourses } from "@/lib/course-access";
import { getCoursesProgress } from "@/lib/course-progress";

// My Courses index (M4-S2) — the "My Courses" nav target. Every accessible
// course as a poster (reusing the dashboard card); access-filtered (Sec Δ).

function CapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.7 2.6 6 2.6s6-1.6 6-2.6v-5" />
    </svg>
  );
}

export default async function CoursesPage() {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const courses = await getAccessibleCourses(ctx.student.id);
  const courseProgress = await getCoursesProgress(
    ctx.student.id,
    courses.map((c) => c.id),
  );

  return (
    <div className="w-full px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">Browse</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-fg sm:text-[2.5rem]">
          My courses
        </h1>
      </header>

      {courses.length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4 border-t border-line pt-10">
          <CapIcon className="h-9 w-9 text-accent/70" />
          <div>
            <h2 className="font-display text-xl font-semibold text-fg">No courses yet</h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-fg-muted">
              Your admin hasn&apos;t assigned any courses yet. They&apos;ll appear here as soon as
              they do.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} progress={courseProgress[course.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
