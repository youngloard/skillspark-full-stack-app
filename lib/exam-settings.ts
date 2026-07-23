import "server-only";
import type { Exam } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";

// JET exam settings (M6-S9, superadmin). Exams are normally created by importing
// a workbook (M7); this gives a lightweight manual create + a settings form
// (name / status / questions-per-quiz / time limit / levels). Removing a level
// that still has questions is blocked — it would orphan them from the quiz.

export type ExamSettingsItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  questionsPerQuiz: number;
  timeLimitMinutes: number;
  levels: string[];
  questionCount: number;
};

function toLevels(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

export async function listExamSettings(): Promise<ExamSettingsItem[]> {
  const exams = await db.exam.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      questionsPerQuiz: true,
      timeLimitMinutes: true,
      levels: true,
      _count: { select: { questions: true } },
    },
  });
  return exams.map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    status: e.status,
    questionsPerQuiz: e.questionsPerQuiz,
    timeLimitMinutes: e.timeLimitMinutes,
    levels: toLevels(e.levels),
    questionCount: e._count.questions,
  }));
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "exam"
  );
}

export type ExamCreateData = { name: string; levels: string[] };

export async function createExam(data: ExamCreateData): Promise<Exam> {
  const base = slugify(data.name);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    try {
      return await db.exam.create({
        data: { name: data.name, slug, levels: data.levels },
      });
    } catch (cause) {
      if (isUniqueViolation(cause)) continue; // slug clash → try the next suffix
      throw cause;
    }
  }
  throw new DomainError("CONFLICT", "Could not allocate a unique slug for this exam");
}

export type ExamSettingsUpdate = {
  name?: string;
  status?: "active" | "inactive";
  questionsPerQuiz?: number;
  timeLimitMinutes?: number;
  levels?: string[];
};

export async function updateExamSettings(
  id: string,
  data: ExamSettingsUpdate,
): Promise<{ before: Exam; after: Exam }> {
  const before = await db.exam.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Exam not found");

  // Guard: can't drop a level that still has questions (orphans them).
  if (data.levels) {
    const removed = toLevels(before.levels).filter((lv) => !data.levels!.includes(lv));
    if (removed.length > 0) {
      const orphaned = await db.question.count({
        where: { examId: id, level: { in: removed } },
      });
      if (orphaned > 0) {
        throw new DomainError(
          "VALIDATION",
          `Level(s) ${removed.join(", ")} still have questions — delete or reassign them first`,
          { levels: "Remove questions from a level before removing it" },
        );
      }
    }
  }

  const after = await db.exam.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.questionsPerQuiz !== undefined && { questionsPerQuiz: data.questionsPerQuiz }),
      ...(data.timeLimitMinutes !== undefined && { timeLimitMinutes: data.timeLimitMinutes }),
      ...(data.levels !== undefined && { levels: data.levels }),
    },
  });
  return { before, after };
}

/** Hard delete — cascades to questions, grants, quiz sessions, and attempts. */
export async function deleteExam(
  id: string,
): Promise<{ exam: Exam; questionCount: number; attemptCount: number }> {
  const exam = await db.exam.findUnique({
    where: { id },
    include: { _count: { select: { questions: true, attempts: true } } },
  });
  if (!exam) throw new DomainError("NOT_FOUND", "Exam not found");
  try {
    const { _count, ...row } = exam;
    await db.exam.delete({ where: { id } });
    return { exam: row as Exam, questionCount: _count.questions, attemptCount: _count.attempts };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025") {
      throw new DomainError("NOT_FOUND", "Exam not found");
    }
    throw cause;
  }
}
