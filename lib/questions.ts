import "server-only";
import type { Prisma, Question } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { invalidateQuestionIds } from "@/lib/question-cache";

// Question domain (M5-S3). Options and answer rows are replaced wholesale on
// update (grid-editing semantic — partial child patches invite drift).
// Every mutation invalidates the (exam, level) id cache. The workbook-import
// commit action lives in M7-S4 (replace/append decided there).

// Amounts travel as strings (CONVENTIONS §Data representation) — Prisma
// Decimals don't serialize across the server-action boundary.
export type QuestionListItem = Omit<Question, "importedAt"> & {
  importedAt: string;
  options: { optionIndex: number; optionText: string }[];
  answerRows: { rowIndex: number; account: string; debit: string | null; credit: string | null }[];
};

export type QuestionInput = {
  examId: string;
  level: string;
  sourceQuestionNo: string;
  prompt: string;
  sheetName?: string;
  options: string[];
  answerRows: { account: string; debit?: number | null; credit?: number | null }[];
};

async function assertLevelValid(examId: string, level: string): Promise<void> {
  const exam = await db.exam.findUnique({ where: { id: examId }, select: { levels: true } });
  if (!exam) throw new DomainError("NOT_FOUND", "Exam not found");
  const levels = Array.isArray(exam.levels) ? (exam.levels as string[]) : [];
  if (!levels.includes(level)) {
    throw new DomainError(
      "VALIDATION",
      `Level "${level}" is not one of this exam's levels (${levels.join(", ")})`,
      { level: "Unknown level for this exam" },
    );
  }
}

const childrenCreate = (input: QuestionInput) => ({
  options: {
    create: input.options.map((optionText, optionIndex) => ({ optionIndex, optionText })),
  },
  answerRows: {
    create: input.answerRows.map((row, rowIndex) => ({
      rowIndex,
      account: row.account,
      debit: row.debit ?? null,
      credit: row.credit ?? null,
    })),
  },
});

export async function createQuestion(input: QuestionInput): Promise<Question> {
  await assertLevelValid(input.examId, input.level);
  try {
    const question = await db.question.create({
      data: {
        examId: input.examId,
        level: input.level,
        sourceQuestionNo: input.sourceQuestionNo,
        prompt: input.prompt,
        sheetName: input.sheetName ?? "manual",
        ...childrenCreate(input),
      },
    });
    invalidateQuestionIds(input.examId, input.level);
    return question;
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError(
        "CONFLICT",
        "A question with this number already exists at this level",
        { sourceQuestionNo: "Already in use at this level" },
      );
    }
    throw cause;
  }
}

/** Replaces prompt/number and ALL children in one transaction. */
export async function updateQuestion(
  id: string,
  input: Omit<QuestionInput, "examId" | "level">,
): Promise<{ before: Question; after: Question }> {
  const before = await db.question.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Question not found");
  try {
    const after = await db.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.answerRow.deleteMany({ where: { questionId: id } });
      return tx.question.update({
        where: { id },
        data: {
          sourceQuestionNo: input.sourceQuestionNo,
          prompt: input.prompt,
          ...(input.sheetName !== undefined && { sheetName: input.sheetName }),
          ...childrenCreate({ ...input, examId: before.examId, level: before.level }),
        },
      });
    });
    invalidateQuestionIds(before.examId, before.level);
    return { before, after };
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError(
        "CONFLICT",
        "A question with this number already exists at this level",
        { sourceQuestionNo: "Already in use at this level" },
      );
    }
    throw cause;
  }
}

export async function deleteQuestion(id: string): Promise<Question> {
  const question = await db.question.findUnique({ where: { id } });
  if (!question) throw new DomainError("NOT_FOUND", "Question not found");
  await db.question.delete({ where: { id } }); // options/rows cascade
  invalidateQuestionIds(question.examId, question.level);
  return question;
}

export type BulkDeleteSelector = { ids: string[] } | { level: string } | { all: true };

/** Reference bulk-delete shapes: explicit ids, a whole level, or everything. */
export async function bulkDeleteQuestions(
  examId: string,
  selector: BulkDeleteSelector,
): Promise<{ deleted: number }> {
  let where: Prisma.QuestionWhereInput;
  if ("ids" in selector) {
    where = { examId, id: { in: selector.ids } };
  } else if ("level" in selector) {
    await assertLevelValid(examId, selector.level);
    where = { examId, level: selector.level };
  } else {
    where = { examId };
  }
  const result = await db.question.deleteMany({ where });
  invalidateQuestionIds(examId, "level" in selector ? selector.level : undefined);
  return { deleted: result.count };
}

export type QuestionListPage = {
  items: QuestionListItem[];
  nextCursor: string | null;
  total: number;
};

export type QuestionListFilters = {
  examId: string;
  levels?: string[];
  search?: string;
};

function questionListWhere(params: QuestionListFilters): Prisma.QuestionWhereInput {
  const search = params.search?.trim();
  return {
    examId: params.examId,
    ...(params.levels?.length ? { level: { in: params.levels } } : {}),
    ...(search
      ? {
          OR: [
            { sourceQuestionNo: { contains: search, mode: "insensitive" } },
            { level: { contains: search, mode: "insensitive" } },
            { prompt: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

const SELECT_ALL_QUESTIONS_CAP = 5_000;

/** ID-only lookup for "select all matching" across the paginated question list. */
export async function listAllQuestionIds(
  filters: QuestionListFilters,
): Promise<{ ids: string[]; capped: boolean }> {
  const rows = await db.question.findMany({
    where: questionListWhere(filters),
    orderBy: [{ sourceQuestionNo: "asc" }, { id: "asc" }],
    take: SELECT_ALL_QUESTIONS_CAP + 1,
    select: { id: true },
  });
  const capped = rows.length > SELECT_ALL_QUESTIONS_CAP;
  return {
    ids: rows.slice(0, SELECT_ALL_QUESTIONS_CAP).map((row) => row.id),
    capped,
  };
}

type CursorTuple = [sourceQuestionNo: string, id: string];

function encodeCursor(tuple: CursorTuple): string {
  return Buffer.from(JSON.stringify(tuple)).toString("base64url");
}

function decodeCursor(cursor: string): CursorTuple {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    ) {
      return parsed as CursorTuple;
    }
  } catch {
    // fall through
  }
  throw new DomainError("VALIDATION", "Invalid pagination cursor — reload the list");
}

/**
 * Admin list: multi-level filter + ILIKE number/level/prompt search, keyset-paginated on
 * (sourceQuestionNo, id) — rides the unique (examId, level, …) index prefix.
 * ILIKE is measured acceptable at this volume (§5; escalation: tsvector).
 */
export async function listQuestions(
  params: QuestionListFilters & {
    cursor?: string;
    limit?: number;
  },
): Promise<QuestionListPage> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const after = params.cursor ? decodeCursor(params.cursor) : null;
  const filters = questionListWhere(params);
  const cursorFilter: Prisma.QuestionWhereInput | null = after
    ? {
        OR: [
          { sourceQuestionNo: { gt: after[0] } },
          { sourceQuestionNo: after[0], id: { gt: after[1] } },
        ],
      }
    : null;

  const [total, rows] = await Promise.all([
    db.question.count({ where: filters }),
    db.question.findMany({
      where: cursorFilter ? { AND: [filters, cursorFilter] } : filters,
      orderBy: [{ sourceQuestionNo: "asc" }, { id: "asc" }],
      take: limit + 1,
      include: {
        options: {
          orderBy: { optionIndex: "asc" },
          select: { optionIndex: true, optionText: true },
        },
        answerRows: {
          orderBy: { rowIndex: "asc" },
          select: { rowIndex: true, account: true, debit: true, credit: true },
        },
      },
    }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items: QuestionListItem[] = page.map((row) => ({
    ...row,
    importedAt: row.importedAt.toISOString(),
    answerRows: row.answerRows.map((answerRow) => ({
      rowIndex: answerRow.rowIndex,
      account: answerRow.account,
      debit: answerRow.debit?.toString() ?? null,
      credit: answerRow.credit?.toString() ?? null,
    })),
  }));
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor([last.sourceQuestionNo, last.id]) : null,
    total,
  };
}
