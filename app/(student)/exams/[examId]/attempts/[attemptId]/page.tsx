import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AttemptReview } from "@/components/student/exam/attempt-review";
import { Chevron } from "@/components/student/exam/quiz-parts";
import { requireStudent } from "@/lib/authorization";
import { getStudentAttempt } from "@/lib/quiz";

// Past-attempt review (M5-S7). Fail-closed: getStudentAttempt returns null for
// anyone else's attempt → notFound (foreign-attempt-403). The full evaluation
// is read from the stored resultsJson; the review renders identically to the
// post-submit screen.

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ examId: string; attemptId: string }>;
}) {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const { examId, attemptId } = await params;
  const attempt = await getStudentAttempt(ctx.student.id, attemptId);
  if (!attempt || attempt.examId !== examId) notFound();

  const completed = new Date(attempt.completedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="w-full px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/exams/${examId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <Chevron className="h-4 w-4 rotate-90" />
          Back to exam
        </Link>
        <span className="tabular text-[13px] text-fg-subtle">{completed}</span>
      </div>

      <div className="mt-5">
        <AttemptReview
          review={{
            level: attempt.level,
            score: attempt.score,
            totalQuestions: attempt.totalQuestions,
            percentage: attempt.percentage,
            performanceLabel: attempt.performanceLabel,
            questionResults: attempt.results.questionResults ?? [],
          }}
          backHref={`/exams/${examId}`}
          backLabel="Back to exam"
        />
      </div>
    </div>
  );
}
