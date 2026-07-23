import "server-only";
import type { Attempt } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import {
  evaluateSubmissions,
  getPerformanceLabel,
  type EvaluationResponse,
  type StudentSubmission,
} from "@/lib/evaluator";
import { getAccessibleExam } from "@/lib/exam-access";
import { getQuestionIdList } from "@/lib/question-cache";

// Quiz start (M5-S4). Reference behavior: Fisher-Yates shuffle over the
// level's bank, serve min(questionsPerQuiz, available) — a short bank still
// yields a (smaller) quiz; only an EMPTY bank is an error (the spec's
// "insufficient questions" case, interpreted per Phase 14 — a 0-question
// quiz is broken, a 15-question quiz when 20 were configured matches the
// reference). Expiry is server authority: now + exam.timeLimitMinutes.

export type StudentQuizQuestion = {
  id: string;
  level: string;
  sourceQuestionNo: string;
  prompt: string;
  options: string[];
  /** How many matrix rows to show by default = the expected answer-row count
   * (the number of entries only, never their content). */
  answerSlotCount: number;
};

export type QuizStartResult = {
  quizId: string;
  level: string;
  questionCount: number;
  timeLimitMinutes: number;
  expiresAt: string;
  questions: StudentQuizQuestion[];
};

/** Fisher-Yates over a copy (the cached list is frozen and shared). */
function sampleIds(ids: readonly string[], count: number): string[] {
  const pool = [...ids];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex]!, pool[index]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/**
 * ≤4 queries: accessible-exam probe (1) + id-list cache miss (≤1) +
 * session insert (1) + hydration (1). Answer rows are NEVER selected —
 * the payload is built from an explicit select without them.
 */
export async function startQuiz(
  studentId: string,
  examId: string,
  level: string,
): Promise<QuizStartResult> {
  const exam = await getAccessibleExam(studentId, examId);
  if (!exam) {
    throw new DomainError("FORBIDDEN", "You don't have access to this exam");
  }
  const levels = Array.isArray(exam.levels) ? (exam.levels as string[]) : [];
  if (!levels.includes(level)) {
    throw new DomainError("VALIDATION", `Pick a valid level (${levels.join(", ")})`, {
      level: "Unknown level for this exam",
    });
  }

  const ids = await getQuestionIdList(examId, level);
  if (ids.length === 0) {
    throw new DomainError(
      "VALIDATION",
      "No questions are available at this level yet — the question bank needs an import first",
    );
  }
  const sampled = sampleIds(ids, exam.questionsPerQuiz);

  const expiresAt = new Date(Date.now() + exam.timeLimitMinutes * 60_000);
  // Reference rule (found at M5-S5, retrofitted): starting a quiz replaces
  // the student's previous open session — one active quiz per (student, exam).
  const [, session] = await db.$transaction([
    db.quizSession.deleteMany({ where: { studentId, examId } }),
    db.quizSession.create({
      data: { studentId, examId, level, questionIds: sampled, expiresAt },
      select: { id: true, expiresAt: true },
    }),
  ]);

  const rows = await db.question.findMany({
    where: { id: { in: sampled } },
    // Explicit select — answerRows CONTENT must never reach a student payload;
    // only the COUNT of expected rows (to size the matrix) is exposed.
    select: {
      id: true,
      level: true,
      sourceQuestionNo: true,
      prompt: true,
      options: { orderBy: { optionIndex: "asc" }, select: { optionText: true } },
      _count: { select: { answerRows: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const questions: StudentQuizQuestion[] = sampled.map((id) => {
    const row = byId.get(id);
    if (!row) throw new DomainError("INTERNAL", "A sampled question disappeared — retry");
    return {
      id: row.id,
      level: row.level,
      sourceQuestionNo: row.sourceQuestionNo,
      prompt: row.prompt,
      options: row.options.map((option) => option.optionText),
      answerSlotCount: Math.max(1, row._count.answerRows),
    };
  });

  return {
    quizId: session.id,
    level,
    questionCount: questions.length,
    timeLimitMinutes: exam.timeLimitMinutes,
    expiresAt: session.expiresAt.toISOString(),
    questions,
  };
}

/**
 * Resume the student's current open quiz (M5-S6). Returns the SAME session's
 * questions (rehydrated without answer rows) + remaining time, or null when
 * there's no session or it has expired. Read-only — unlike startQuiz it never
 * creates or replaces a session, so a page refresh mid-quiz keeps the same
 * questions and clock. Answer rows are never selected (answers never leak).
 */
export async function getActiveQuiz(
  studentId: string,
  examId: string,
): Promise<QuizStartResult | null> {
  const session = await db.quizSession.findFirst({
    where: { studentId, examId },
    orderBy: { expiresAt: "desc" },
    select: { id: true, level: true, questionIds: true, expiresAt: true },
  });
  if (!session) return null;
  if (Date.now() > session.expiresAt.getTime()) return null; // expired → no resume

  const exam = await getAccessibleExam(studentId, examId);
  if (!exam) return null;

  const rows = await db.question.findMany({
    where: { id: { in: session.questionIds } },
    select: {
      id: true,
      level: true,
      sourceQuestionNo: true,
      prompt: true,
      options: { orderBy: { optionIndex: "asc" }, select: { optionText: true } },
      _count: { select: { answerRows: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const questions: StudentQuizQuestion[] = session.questionIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => ({
      id: row.id,
      level: row.level,
      sourceQuestionNo: row.sourceQuestionNo,
      prompt: row.prompt,
      options: row.options.map((option) => option.optionText),
      answerSlotCount: Math.max(1, row._count.answerRows),
    }));

  return {
    quizId: session.id,
    level: session.level,
    questionCount: questions.length,
    timeLimitMinutes: exam.timeLimitMinutes,
    expiresAt: session.expiresAt.toISOString(),
    questions,
  };
}

// ---------- Submit (M5-S5) ----------

/**
 * The reference never checks expiry at submit — its 24h prune of expired
 * sessions is the only enforcement, so a late submit within 24h of expiry
 * lands and anything older finds no session. Made explicit and deterministic
 * here as a grace window (DECISIONS); the client timer auto-submits at zero.
 */
const SUBMIT_GRACE_MS = 24 * 60 * 60 * 1000;

export type AttemptDetail = {
  id: string;
  quizId: string;
  examId: string;
  level: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  performanceLabel: string;
  completedAt: string;
  results: EvaluationResponse;
};

export type SubmitQuizResult = {
  attempt: AttemptDetail;
  alreadySubmitted: boolean;
};

function toAttemptDetail(attempt: Attempt): AttemptDetail {
  return {
    id: attempt.id,
    quizId: attempt.quizId,
    examId: attempt.examId,
    level: attempt.level,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    percentage: Number(attempt.percentage),
    performanceLabel: attempt.performanceLabel,
    completedAt: attempt.completedAt.toISOString(),
    results: attempt.resultsJson as EvaluationResponse,
  };
}

/**
 * A student's own attempt for review (M5-S7). Fail-closed: null unless the
 * attempt belongs to this student — a foreign attempt id is indistinguishable
 * from a missing one (foreign-attempt-403). Returns the stored evaluation.
 */
export async function getStudentAttempt(
  studentId: string,
  attemptId: string,
): Promise<AttemptDetail | null> {
  const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.studentId !== studentId) return null;
  return toAttemptDetail(attempt);
}

/**
 * Idempotent submit (§5): evaluate server-side, insert-first on the unique
 * quizId — double and concurrent submits converge on ONE attempt, later
 * callers get it back with alreadySubmitted: true.
 */
export async function submitQuiz(
  studentId: string,
  quizId: string,
  submissions: StudentSubmission[],
): Promise<SubmitQuizResult> {
  const existing = await db.attempt.findUnique({ where: { quizId } });
  if (existing) {
    if (existing.studentId !== studentId) {
      throw new DomainError("NOT_FOUND", "Quiz session not found or expired.");
    }
    return { attempt: toAttemptDetail(existing), alreadySubmitted: true };
  }

  const session = await db.quizSession.findFirst({ where: { id: quizId, studentId } });
  if (!session) {
    throw new DomainError("NOT_FOUND", "Quiz session not found or expired.");
  }
  if (Date.now() > session.expiresAt.getTime() + SUBMIT_GRACE_MS) {
    await db.quizSession.deleteMany({ where: { id: quizId } });
    throw new DomainError("VALIDATION", "This quiz expired — start a new one.");
  }

  // Hydrate WITH answer rows (server-side only) in the session's order.
  const rows = await db.question.findMany({
    where: { id: { in: session.questionIds } },
    include: { answerRows: { orderBy: { rowIndex: "asc" } } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const questions = session.questionIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => ({
      id: row.id,
      sourceQuestionNo: row.sourceQuestionNo,
      prompt: row.prompt,
      answerRows: row.answerRows.map((answerRow) => ({
        id: answerRow.id,
        account: answerRow.account,
        debit: answerRow.debit === null ? null : Number(answerRow.debit),
        credit: answerRow.credit === null ? null : Number(answerRow.credit),
      })),
    }));

  const results = evaluateSubmissions(session.level, questions, submissions);
  const score = results.correctQuestions;

  try {
    const attempt = await db.attempt.create({
      data: {
        quizId,
        studentId,
        examId: session.examId,
        level: session.level,
        score,
        totalQuestions: results.totalQuestions,
        percentage: results.totalQuestions === 0 ? 0 : score / results.totalQuestions,
        performanceLabel: getPerformanceLabel(score, results.totalQuestions),
        resultsJson: results as object,
      },
    });
    await db.quizSession.deleteMany({ where: { id: quizId } });
    return { attempt: toAttemptDetail(attempt), alreadySubmitted: false };
  } catch (cause) {
    // A concurrent submit won the unique(quizId) race — converge on its row.
    if (isUniqueViolation(cause)) {
      const winner = await db.attempt.findUnique({ where: { quizId } });
      if (winner && winner.studentId === studentId) {
        return { attempt: toAttemptDetail(winner), alreadySubmitted: true };
      }
    }
    throw cause;
  }
}
