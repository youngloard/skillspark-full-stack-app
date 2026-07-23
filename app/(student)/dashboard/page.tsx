import Link from "next/link";
import { redirect } from "next/navigation";
import { CourseCard } from "@/components/student/course-card";
import { requireStudent } from "@/lib/authorization";
import { getStudentDashboard } from "@/lib/student-dashboard";

// Student dashboard (M4-S1). Full-bleed like the nav; editorial rather than a
// card-stack — a typographic greeting, ONE deep-teal hero (the colour moment),
// a ledger-style exam row, then the course posters. All data via the access
// helpers (a student sees only what they're granted).

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
    </svg>
  );
}

function ArrowRight({ className }: { className?: string }) {
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
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function ExamIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

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

export default async function DashboardPage() {
  // Full re-check (active + in-window); expired/blocked → back to login.
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const { courses, courseProgress, jetExam, continueLearning } = await getStudentDashboard(
    ctx.student.id,
  );
  const firstName = (ctx.student.name ?? "").trim().split(" ")[0] || "there";
  const nothingYet = courses.length === 0 && !jetExam;

  // The single rich colour moment (the login's deep-teal field): the student's
  // most useful next action — resume, else a first course, else the exam.
  const hero = continueLearning
    ? {
        href: `/courses/${continueLearning.courseId}`,
        kicker: "Continue learning",
        title: continueLearning.itemTitle,
        sub: continueLearning.courseName,
        cta: "Resume",
        play: true,
      }
    : courses[0]
      ? {
          href: `/courses/${courses[0].id}`,
          kicker: "Start learning",
          title: courses[0].name,
          sub: courses[0].description ?? "Open your first lesson.",
          cta: "Open course",
          play: true,
        }
      : jetExam
        ? {
            href: "/exams",
            kicker: "JET Exam",
            title: jetExam.name,
            sub: "Practise timed accounting-entry questions and track your score.",
            cta: "Go to exam",
            play: false,
          }
        : null;

  const showJetRow = Boolean(jetExam) && hero?.kicker !== "JET Exam";

  return (
    <div className="w-full px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">
          Your learning space
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-[2.5rem]">
          Welcome back, <span className="text-accent">{firstName}</span>.
        </h1>
      </header>

      {nothingYet ? (
        <div className="mt-10 flex flex-col items-start gap-4 border-t border-line pt-10">
          <CapIcon className="h-9 w-9 text-accent/70" />
          <div>
            <h2 className="font-display text-xl font-semibold text-fg">Nothing here just yet</h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-fg-muted">
              Your admin will assign your courses and exam soon. Check back shortly — everything
              will appear here.
            </p>
          </div>
        </div>
      ) : (
        <>
          {hero ? (
            <section className="mt-9 border-b border-line pb-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                {hero.kicker}
              </p>
              <h2 className="mt-2.5 max-w-3xl font-display text-2xl font-semibold leading-tight text-balance text-fg sm:text-[2rem]">
                {hero.title}
              </h2>
              <p className="mt-2 line-clamp-2 max-w-2xl text-[15px] text-fg-muted">{hero.sub}</p>
              <Link
                href={hero.href}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
              >
                {hero.play ? (
                  <PlayIcon className="h-3.5 w-3.5" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {hero.cta}
              </Link>
            </section>
          ) : null}

          {showJetRow && jetExam ? (
            <div className="flex flex-col gap-4 border-b border-line py-7 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                  <ExamIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-fg">{jetExam.name}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    Practise timed accounting-entry questions and track your score.
                  </p>
                </div>
              </div>
              <Link
                href="/exams"
                className="group inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-accent sm:self-center"
              >
                Go to exam
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          ) : null}

          {courses.length > 0 ? (
            <section className="mt-12">
              <h2 className="mb-5 text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                {courses.length > 1 ? "Your courses" : "Your course"}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {courses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    progress={courseProgress[course.id]}
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-8 text-sm text-fg-muted">
              No courses assigned yet — your JET exam is ready above.
            </p>
          )}
        </>
      )}
    </div>
  );
}
