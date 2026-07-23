import { redirect } from "next/navigation";
import { QuizRunner } from "@/components/student/exam/quiz-runner";
import { requireStudent } from "@/lib/authorization";
import { getActiveQuiz } from "@/lib/quiz";

// The quiz-taking route (M5-S6). Reads the ACTIVE session (never starts one —
// starting is a mutation done by the dashboard's Start action), so a refresh
// resumes the same questions + clock. No open session → back to the dashboard.

export default async function QuizPage({ params }: { params: Promise<{ examId: string }> }) {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const { examId } = await params;
  const quiz = await getActiveQuiz(ctx.student.id, examId);
  if (!quiz) redirect(`/exams/${examId}`);

  return (
    <div className="w-full px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <QuizRunner
        examId={examId}
        quizId={quiz.quizId}
        level={quiz.level}
        questions={quiz.questions}
        expiresAt={quiz.expiresAt}
      />
    </div>
  );
}
