import "server-only";

import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { invalidateQuestionIds } from "@/lib/question-cache";
import {
  findExistingQuestionImportDuplicates,
  normalizeQuestionPrompt,
  questionImportKey,
  questionPromptFingerprint,
} from "@/lib/question-import-duplicates";
import type { ParsedQuestion } from "@/lib/question-import";

// Bulk question import runner. Questions are insert-only. A transaction-level
// advisory lock serializes imports for the same exam, then both the natural
// identity and normalized prompt are checked before batch insertion. The DB
// unique triple remains the final guard for number collisions outside imports.

export type QuestionImportOutcome = {
  sourceQuestionNo: string;
  status: "created" | "duplicate" | "error";
  message?: string;
};

export async function importQuestionRows(
  examId: string,
  level: string,
  rows: ParsedQuestion[],
): Promise<QuestionImportOutcome[]> {
  const seenNumbers = new Set<string>();
  const seenPrompts = new Set<string>();
  const repeatedRows = new Set<ParsedQuestion>();
  const candidates: ParsedQuestion[] = [];

  for (const question of rows) {
    if (question.error) continue;
    const promptFingerprint = questionPromptFingerprint(question.prompt);
    if (seenNumbers.has(question.sourceQuestionNo) || seenPrompts.has(promptFingerprint)) {
      repeatedRows.add(question);
      continue;
    }
    seenNumbers.add(question.sourceQuestionNo);
    seenPrompts.add(promptFingerprint);
    candidates.push(question);
  }

  if (candidates.length === 0) {
    return rows.map((question) =>
      question.error
        ? { sourceQuestionNo: question.sourceQuestionNo, status: "error", message: question.error }
        : { sourceQuestionNo: question.sourceQuestionNo, status: "duplicate" },
    );
  }

  let insertedNumbers: Set<string>;
  try {
    const exam = await db.exam.findUnique({ where: { id: examId }, select: { levels: true } });
    if (!exam) throw new DomainError("NOT_FOUND", "Exam not found");
    const examLevels = Array.isArray(exam.levels) ? (exam.levels as string[]) : [];
    if (!examLevels.includes(level)) {
      throw new DomainError(
        "VALIDATION",
        `Level "${level}" is not one of this exam's levels (${examLevels.join(", ")})`,
      );
    }

    const inserted = await db.$transaction(async (tx) => {
      // Prevent two concurrent files from inserting the same prompt under
      // different levels/numbers. The lock is released automatically here.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`question-import:${examId}`}))::text AS lock`;

      const existing = await findExistingQuestionImportDuplicates(
        examId,
        candidates.map((question) => ({ ...question, level })),
        tx,
      );
      const insertable = candidates.filter(
        (question) =>
          !existing.identityKeys.has(questionImportKey(level, question.sourceQuestionNo)) &&
          !existing.promptFingerprints.has(questionPromptFingerprint(question.prompt)),
      );
      if (insertable.length === 0) return [];

      const createdQuestions = await tx.question.createManyAndReturn({
        data: insertable.map((question) => ({
          examId,
          level,
          sourceQuestionNo: question.sourceQuestionNo,
          prompt: normalizeQuestionPrompt(question.prompt),
          sheetName: question.sheetName ?? "import",
        })),
        skipDuplicates: true,
        select: { id: true, sourceQuestionNo: true },
      });

      const candidateByNumber = new Map(
        insertable.map((question) => [question.sourceQuestionNo, question]),
      );
      const optionRows = createdQuestions.flatMap((created) => {
        const question = candidateByNumber.get(created.sourceQuestionNo)!;
        return question.options.map((optionText, optionIndex) => ({
          questionId: created.id,
          optionIndex,
          optionText,
        }));
      });
      const answerRows = createdQuestions.flatMap((created) => {
        const question = candidateByNumber.get(created.sourceQuestionNo)!;
        return question.answerRows.map((answer, rowIndex) => ({
          questionId: created.id,
          rowIndex,
          account: answer.account,
          debit: answer.debit,
          credit: answer.credit,
        }));
      });

      if (optionRows.length > 0) await tx.questionOption.createMany({ data: optionRows });
      if (answerRows.length > 0) await tx.answerRow.createMany({ data: answerRows });
      return createdQuestions;
    });

    insertedNumbers = new Set(inserted.map((question) => question.sourceQuestionNo));
    if (insertedNumbers.size > 0) invalidateQuestionIds(examId, level);
  } catch (cause) {
    const message =
      cause instanceof DomainError ? cause.message : "Import failed for this question";
    return rows.map((question) => {
      if (question.error) {
        return {
          sourceQuestionNo: question.sourceQuestionNo,
          status: "error",
          message: question.error,
        };
      }
      if (repeatedRows.has(question)) {
        return { sourceQuestionNo: question.sourceQuestionNo, status: "duplicate" };
      }
      return { sourceQuestionNo: question.sourceQuestionNo, status: "error", message };
    });
  }

  return rows.map((question) => {
    if (question.error) {
      return {
        sourceQuestionNo: question.sourceQuestionNo,
        status: "error",
        message: question.error,
      };
    }
    if (repeatedRows.has(question) || !insertedNumbers.has(question.sourceQuestionNo)) {
      return {
        sourceQuestionNo: question.sourceQuestionNo,
        status: "duplicate",
        message: "This question already exists in the exam",
      };
    }
    return { sourceQuestionNo: question.sourceQuestionNo, status: "created" };
  });
}
