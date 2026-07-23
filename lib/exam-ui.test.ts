import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// M5-S6 integration: getActiveQuiz (resume, refresh-mid-quiz-resumes-session)
// and getExamDashboard (levels/counts/scores/active-session), against the real
// DB. `react.cache` is stubbed so the module-level helpers run per call.

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const { startQuiz, getActiveQuiz, submitQuiz, getStudentAttempt } = await import("./quiz");
const { getExamDashboard } = await import("./exam-dashboard");
const { clearQuestionIdCache } = await import("@/lib/question-cache");
const { db } = await import("@/lib/db");

const STAMP = `m5s6-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let examId: string;
let studentId: string;

beforeAll(async () => {
  const window = {
    accessStartDate: new Date(Date.now() - 86_400_000),
    accessEndDate: new Date(Date.now() + 86_400_000),
  };
  examId = (
    await db.exam.create({
      data: {
        slug: `ui-${STAMP}`,
        name: `Exam UI ${STAMP}`,
        questionsPerQuiz: 4,
        timeLimitMinutes: 30,
        levels: ["basic", "medium", "hard"],
      },
    })
  ).id;
  studentId = (
    await db.student.create({
      data: { name: "UI Student", email: `ui-${STAMP}@test.skillspark.local`, ...window },
    })
  ).id;
  await db.batch.create({
    data: {
      batchCode: `UI-${STAMP}`,
      batchName: "UI Batch",
      studentBatches: { create: { studentId } },
      batchExams: { create: { examId } },
    },
  });
  // basic: 6 questions; medium: 2; hard: 0.
  for (let i = 1; i <= 6; i++) {
    await db.question.create({
      data: {
        examId,
        level: "basic",
        sourceQuestionNo: `b${i}`,
        prompt: `Basic ${i}`,
        sheetName: "Seed",
        options: { create: [{ optionIndex: 0, optionText: "Cash" }] },
        answerRows: { create: [{ rowIndex: 0, account: "Cash", debit: 10, credit: null }] },
      },
    });
  }
  for (let i = 1; i <= 2; i++) {
    await db.question.create({
      data: {
        examId,
        level: "medium",
        sourceQuestionNo: `m${i}`,
        prompt: `Medium ${i}`,
        sheetName: "Seed",
        options: { create: [{ optionIndex: 0, optionText: "Cash" }] },
        answerRows: { create: [{ rowIndex: 0, account: "Cash", debit: 10, credit: null }] },
      },
    });
  }
  clearQuestionIdCache();
});

afterAll(async () => {
  await db.attempt.deleteMany({ where: { studentId } });
  await db.quizSession.deleteMany({ where: { studentId } });
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("getActiveQuiz (refresh-mid-quiz-resumes-session)", () => {
  it("resumes the same session's questions + clock", async () => {
    const started = await startQuiz(studentId, examId, "basic");
    const resumed = await getActiveQuiz(studentId, examId);
    expect(resumed).not.toBeNull();
    expect(resumed?.quizId).toBe(started.quizId);
    expect(resumed?.expiresAt).toBe(started.expiresAt);
    expect(resumed?.questions.map((q) => q.id)).toEqual(started.questions.map((q) => q.id));
    // Answers never leak on resume either.
    expect(JSON.stringify(resumed)).not.toContain("answerRows");
    expect(JSON.stringify(resumed)).not.toContain("debit");
  });

  it("returns null when the session has expired", async () => {
    const started = await startQuiz(studentId, examId, "basic");
    await db.quizSession.update({
      where: { id: started.quizId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getActiveQuiz(studentId, examId)).toBeNull();
  });

  it("returns null when there's no open session", async () => {
    await db.quizSession.deleteMany({ where: { studentId } });
    expect(await getActiveQuiz(studentId, examId)).toBeNull();
  });
});

describe("getExamDashboard", () => {
  it("reports settings, per-level counts, active session, and past scores", async () => {
    await db.quizSession.deleteMany({ where: { studentId } });
    await db.attempt.deleteMany({ where: { studentId } });

    // A completed attempt (past score) and a fresh open session (resumable).
    const done = await startQuiz(studentId, examId, "basic");
    await submitQuiz(studentId, done.quizId, []);
    const open = await startQuiz(studentId, examId, "medium");

    const dash = await getExamDashboard(studentId, examId);
    expect(dash).not.toBeNull();
    expect(dash?.exam.questionsPerQuiz).toBe(4);
    expect(dash?.exam.timeLimitMinutes).toBe(30);

    const counts = Object.fromEntries(dash!.levels.map((l) => [l.level, l.questionCount]));
    expect(counts).toEqual({ basic: 6, medium: 2, hard: 0 });

    expect(dash?.activeQuiz?.quizId).toBe(open.quizId);
    expect(dash?.attempts.length).toBeGreaterThanOrEqual(1);
    expect(dash?.attempts[0]?.level).toBe("basic");
  });

  it("fail-closed for an inaccessible exam", async () => {
    const outsider = await db.student.create({
      data: {
        name: "Outsider",
        email: `out-${STAMP}@test.skillspark.local`,
        accessStartDate: new Date(Date.now() - 1000),
        accessEndDate: new Date(Date.now() + 86_400_000),
      },
    });
    expect(await getExamDashboard(outsider.id, examId)).toBeNull();
  });
});

describe("getStudentAttempt (M5-S7)", () => {
  it("breakdown-matches-evaluator-output", async () => {
    await db.quizSession.deleteMany({ where: { studentId } });
    const started = await startQuiz(studentId, examId, "basic");
    const submitted = await submitQuiz(studentId, started.quizId, []);

    const attempt = await getStudentAttempt(studentId, submitted.attempt.id);
    expect(attempt).not.toBeNull();
    // The stored review is exactly the evaluator output the submit produced.
    expect(attempt?.score).toBe(submitted.attempt.score);
    expect(attempt?.totalQuestions).toBe(submitted.attempt.totalQuestions);
    expect(attempt?.results.questionResults.length).toBe(started.questionCount);
    expect(attempt?.results).toEqual(submitted.attempt.results);
  });

  it("foreign-attempt-403: a student can only open their own attempt", async () => {
    await db.quizSession.deleteMany({ where: { studentId } });
    const started = await startQuiz(studentId, examId, "basic");
    const submitted = await submitQuiz(studentId, started.quizId, []);

    const stranger = await db.student.create({
      data: {
        name: "Stranger",
        email: `str-${STAMP}@test.skillspark.local`,
        accessStartDate: new Date(Date.now() - 1000),
        accessEndDate: new Date(Date.now() + 86_400_000),
      },
    });
    expect(await getStudentAttempt(stranger.id, submitted.attempt.id)).toBeNull();
    expect(await getStudentAttempt(studentId, "no-such-attempt")).toBeNull();
  });
});
