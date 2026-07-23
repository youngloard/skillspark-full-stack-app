import "server-only";
import { db } from "@/lib/db";
import { getAccessibleExam } from "@/lib/exam-access";

// Exam dashboard payload (M5-S6): settings, per-level question counts, recent
// attempts (past scores), and whether a resumable session is open. Fail-closed
// via getAccessibleExam. All reads — no answer rows anywhere.

export type ExamLevelInfo = { level: string; questionCount: number };

export type ExamAttemptSummary = {
  id: string;
  level: string;
  score: number;
  totalQuestions: number;
  percentage: number; // 0–1
  performanceLabel: string;
  completedAt: string;
};

/** Past scores per page. */
export const ATTEMPTS_PAGE_SIZE = 10;

export type ExamDashboard = {
  exam: {
    id: string;
    name: string;
    questionsPerQuiz: number;
    timeLimitMinutes: number;
    levels: string[];
  };
  levels: ExamLevelInfo[];
  attempts: ExamAttemptSummary[];
  attemptsPage: number;
  attemptsTotal: number;
  /** An open, non-expired session the student can resume, if any. */
  activeQuiz: { quizId: string; level: string; expiresAt: string } | null;
};

export async function getExamDashboard(
  studentId: string,
  examId: string,
  attemptsPage = 1,
): Promise<ExamDashboard | null> {
  const exam = await getAccessibleExam(studentId, examId);
  if (!exam) return null;
  const levels = Array.isArray(exam.levels) ? (exam.levels as string[]) : [];

  const now = new Date();
  const page = Math.max(1, Math.floor(attemptsPage));
  const [counts, attempts, attemptsTotal, session] = await Promise.all([
    db.question.groupBy({ by: ["level"], where: { examId }, _count: { _all: true } }),
    db.attempt.findMany({
      where: { studentId, examId },
      orderBy: { completedAt: "desc" },
      skip: (page - 1) * ATTEMPTS_PAGE_SIZE,
      take: ATTEMPTS_PAGE_SIZE,
      select: {
        id: true,
        level: true,
        score: true,
        totalQuestions: true,
        percentage: true,
        performanceLabel: true,
        completedAt: true,
      },
    }),
    db.attempt.count({ where: { studentId, examId } }),
    db.quizSession.findFirst({
      where: { studentId, examId, expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
      select: { id: true, level: true, expiresAt: true },
    }),
  ]);

  const countByLevel = new Map(counts.map((c) => [c.level, c._count._all]));

  return {
    exam: {
      id: exam.id,
      name: exam.name,
      questionsPerQuiz: exam.questionsPerQuiz,
      timeLimitMinutes: exam.timeLimitMinutes,
      levels,
    },
    levels: levels.map((level) => ({ level, questionCount: countByLevel.get(level) ?? 0 })),
    attempts: attempts.map((a) => ({
      id: a.id,
      level: a.level,
      score: a.score,
      totalQuestions: a.totalQuestions,
      percentage: Number(a.percentage),
      performanceLabel: a.performanceLabel,
      completedAt: a.completedAt.toISOString(),
    })),
    attemptsPage: page,
    attemptsTotal,
    activeQuiz: session
      ? { quizId: session.id, level: session.level, expiresAt: session.expiresAt.toISOString() }
      : null,
  };
}
