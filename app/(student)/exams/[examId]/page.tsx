import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStudent } from "@/lib/authorization";
import {
  ATTEMPTS_PAGE_SIZE,
  getExamDashboard,
  type ExamAttemptSummary,
} from "@/lib/exam-dashboard";
import { startQuiz } from "@/lib/quiz";

// Exam dashboard (M5-S6): settings, levels with question counts + Start, a
// resume banner for an open session, and past scores. Editorial §14.

function levelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scoreTone(label: string): string {
  if (label === "Excellent" || label === "Very Good") return "bg-accent/10 text-accent";
  if (label === "Good") return "bg-surface-2 text-fg-muted";
  return "bg-warning/10 text-warning";
}

export default async function ExamDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ error?: string; attemptsPage?: string }>;
}) {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const { examId } = await params;
  const sp = await searchParams;
  const requestedPage = Number(sp.attemptsPage) || 1;
  const dash = await getExamDashboard(ctx.student.id, examId, requestedPage);
  if (!dash) notFound();

  const startError = sp.error === "start";
  const totalPages = Math.max(1, Math.ceil(dash.attemptsTotal / ATTEMPTS_PAGE_SIZE));

  // Server action: start a quiz at the chosen level, then go to the runner.
  async function start(formData: FormData) {
    "use server";
    const level = String(formData.get("level") ?? "");
    const { student } = await requireStudent();
    let started = false;
    try {
      await startQuiz(student.id, examId, level);
      started = true;
    } catch {
      started = false;
    }
    redirect(started ? `/exams/${examId}/quiz` : `/exams/${examId}?error=start`);
  }

  return (
    <div className="w-full px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">Exam</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg sm:text-[2.5rem]">
          {dash.exam.name}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          Timed practice — pick a level, record the journal entries, and get instant scoring with a
          full answer review.
        </p>
        <div className="mt-6 flex gap-8">
          <div>
            <p className="tabular font-display text-2xl font-semibold text-fg">
              {dash.exam.questionsPerQuiz}
            </p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
              Questions / quiz
            </p>
          </div>
          <div className="border-l border-line pl-8">
            <p className="tabular font-display text-2xl font-semibold text-fg">
              {dash.exam.timeLimitMinutes}
              <span className="ml-1 text-base font-medium text-fg-muted">min</span>
            </p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
              Time limit
            </p>
          </div>
        </div>
      </header>

      {startError ? (
        <div
          role="alert"
          className="mt-6 max-w-xl rounded-lg border border-danger/25 bg-danger/8 px-4 py-3 text-sm text-danger"
        >
          Couldn&apos;t start that quiz — that level may not have any questions yet.
        </div>
      ) : null}

      {dash.activeQuiz ? (
        <div className="mt-8 flex flex-col gap-3 border-y border-line py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              In progress
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {levelLabel(dash.activeQuiz.level)} quiz — pick up where you left off.
            </p>
          </div>
          <Link
            href={`/exams/${examId}/quiz`}
            className="group inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-accent sm:self-center"
          >
            Resume quiz
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          Choose a level
        </h2>
        {/* Stacked hairline rows on mobile; a horizontal 3-column row (vertical
            dividers, no cards) on large screens. */}
        <div className="divide-y divide-line border-t border-line lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {dash.levels.map((lvl, i) => (
            <div
              key={lvl.level}
              className={`flex items-center justify-between gap-4 py-4 lg:flex-col lg:items-start lg:gap-5 lg:px-6 lg:py-6 ${
                i === 0 ? "lg:pl-0" : ""
              } ${i === dash.levels.length - 1 ? "lg:pr-0" : ""}`}
            >
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-fg">
                  {levelLabel(lvl.level)}
                </p>
                <p className="tabular text-sm text-fg-subtle">
                  {lvl.questionCount} {lvl.questionCount === 1 ? "question" : "questions"} in the
                  bank
                </p>
              </div>
              {lvl.questionCount > 0 ? (
                <form action={start}>
                  <input type="hidden" name="level" value={lvl.level} />
                  <button
                    type="submit"
                    className="inline-flex shrink-0 items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
                  >
                    Start
                  </button>
                </form>
              ) : (
                <span className="shrink-0 text-sm text-fg-subtle">No questions yet</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          Past scores
        </h2>
        {dash.attempts.length === 0 ? (
          <p className="border-t border-line pt-6 text-sm text-fg-muted">
            No attempts yet — start a quiz above to see your scores here.
          </p>
        ) : (
          <>
            <div className="space-y-0.5 border-t border-line pt-2">
              {dash.attempts.map((a) => (
                <AttemptRow key={a.id} attempt={a} examId={examId} />
              ))}
            </div>
            {totalPages > 1 ? (
              <nav className="mt-5 flex items-center justify-between text-sm">
                <PagerLink
                  href={`/exams/${examId}?attemptsPage=${dash.attemptsPage - 1}`}
                  disabled={dash.attemptsPage <= 1}
                  dir="prev"
                />
                <span className="tabular text-fg-subtle">
                  Page {dash.attemptsPage} of {totalPages}
                </span>
                <PagerLink
                  href={`/exams/${examId}?attemptsPage=${dash.attemptsPage + 1}`}
                  disabled={dash.attemptsPage >= totalPages}
                  dir="next"
                />
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  dir,
}: {
  href: string;
  disabled: boolean;
  dir: "prev" | "next";
}) {
  const label = dir === "prev" ? "Previous" : "Next";
  const arrow = dir === "prev" ? "←" : "→";
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-subtle opacity-40">
        {dir === "prev" ? arrow : null}
        {label}
        {dir === "next" ? arrow : null}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-medium text-fg-muted transition-colors hover:text-fg"
    >
      {dir === "prev" ? arrow : null}
      {label}
      {dir === "next" ? arrow : null}
    </Link>
  );
}

function AttemptRow({ attempt, examId }: { attempt: ExamAttemptSummary; examId: string }) {
  const pct = Math.round(attempt.percentage * 100);
  return (
    <Link
      href={`/exams/${examId}/attempts/${attempt.id}`}
      className="group flex items-center justify-between gap-4 rounded-md px-3 py-3.5 transition-colors hover:bg-surface-2/60"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg transition-colors group-hover:text-accent">
          {levelLabel(attempt.level)}
        </p>
        <p className="tabular text-[13px] text-fg-subtle">{formatDate(attempt.completedAt)}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular text-sm text-fg-muted">
          {attempt.score} / {attempt.totalQuestions}
        </span>
        <span className="tabular w-12 text-right text-sm font-semibold text-fg">{pct}%</span>
        <span
          className={`hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${scoreTone(
            attempt.performanceLabel,
          )}`}
        >
          {attempt.performanceLabel}
        </span>
      </div>
    </Link>
  );
}
