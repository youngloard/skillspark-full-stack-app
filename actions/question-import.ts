"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import type { ParsedLevel } from "@/lib/exam-workbook";
import { DomainError } from "@/lib/errors";
import {
  findExistingQuestionImportDuplicates,
  questionImportKey,
  questionPromptFingerprint,
} from "@/lib/question-import-duplicates";
import { parseQuestionsCsv } from "@/lib/question-import";
import { prepareQuestionWorkbookImport } from "@/lib/question-workbook-import";
import { importQuestionRows, type QuestionImportOutcome } from "@/lib/question-import-run";

// Bulk question import (M6-S7). Excel files are parsed server-side for preview;
// accepted Excel/CSV questions are then streamed here in bounded chunks.

const rowSchema = z.object({
  sourceQuestionNo: z.string().trim().min(1).max(64),
  prompt: z.string().trim().min(1).max(10_000),
  options: z.array(z.string().trim().min(1).max(1_000)).min(1).max(50),
  answerRows: z
    .array(
      z.object({
        account: z.string().trim().max(500),
        debit: z.number().finite().nullable(),
        credit: z.number().finite().nullable(),
      }),
    )
    .max(100),
  error: z.string().nullable(),
  sheetName: z.string().trim().max(200).optional(),
});

const chunkSchema = z.object({
  examId: z.string().min(1),
  level: z.string().trim().min(1).max(50),
  questions: z.array(rowSchema).min(1).max(50),
});

const previewSchema = z.object({
  examId: z.string().min(1),
  mode: z.enum(["full", "single"]),
  targetLevel: z.enum(["basic", "medium", "hard"]).optional(),
});

export type QuestionWorkbookPreview = {
  importedLevels: ParsedLevel[];
  counts: Record<ParsedLevel, number>;
  questions: Array<{
    level: ParsedLevel;
    sourceQuestionNo: string;
    prompt: string;
    options: string[];
    answerRows: Array<{ account: string; debit: number | null; credit: number | null }>;
    sheetName: string;
    error: string | null;
    duplicate: boolean;
  }>;
};

export async function previewQuestionWorkbook(
  input: unknown,
): Promise<ApiResult<QuestionWorkbookPreview>> {
  return runAction("question.import_preview", async () => {
    await requireAdmin();

    if (!(input instanceof FormData)) {
      return invalidInput(
        new z.ZodError([
          {
            code: "custom",
            message: "Upload form data is required",
            path: [],
            input,
          },
        ]),
      );
    }

    const metadata = previewSchema.safeParse({
      examId: input.get("examId"),
      mode: input.get("mode"),
      targetLevel: input.get("targetLevel") || undefined,
    });
    if (!metadata.success) return invalidInput(metadata.error);

    const file = input.get("file");
    if (!(file instanceof File)) {
      return invalidInput(
        new z.ZodError([
          {
            code: "custom",
            message: "Choose an Excel (.xlsx) or CSV file",
            path: ["file"],
            input: file,
          },
        ]),
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new DomainError("VALIDATION", "The question file exceeds the 5 MB import limit");
    }

    const lowerName = file.name.toLowerCase();
    let questions: QuestionWorkbookPreview["questions"];
    let importedLevels: ParsedLevel[];
    let counts: Record<ParsedLevel, number>;

    if (lowerName.endsWith(".csv")) {
      if (metadata.data.mode !== "single" || !metadata.data.targetLevel) {
        throw new DomainError("VALIDATION", "CSV files require Single level mode and a level");
      }
      const targetLevel = metadata.data.targetLevel;
      const csvQuestions = parseQuestionsCsv(await file.text());
      importedLevels = [targetLevel];
      counts = { basic: 0, medium: 0, hard: 0 };
      counts[targetLevel] = csvQuestions.length;
      questions = csvQuestions.map((question) => ({
        ...question,
        level: targetLevel,
        sheetName: file.name,
        duplicate: false,
      }));
    } else {
      const parsed = await prepareQuestionWorkbookImport(
        Buffer.from(await file.arrayBuffer()),
        metadata.data.mode,
        metadata.data.targetLevel,
      );
      importedLevels = parsed.importedLevels;
      counts = parsed.counts;
      questions = parsed.questions.map((question) => ({
        ...question,
        error: null,
        duplicate: false,
      }));
    }

    const existing = await findExistingQuestionImportDuplicates(
      metadata.data.examId,
      questions.filter((question) => !question.error),
    );
    const seenIdentityKeys = new Set<string>();
    const seenPromptFingerprints = new Set<string>();
    questions = questions.map((question) => {
      if (question.error) return question;
      const identityKey = questionImportKey(question.level, question.sourceQuestionNo);
      const promptFingerprint = questionPromptFingerprint(question.prompt);
      const duplicate =
        existing.identityKeys.has(identityKey) ||
        existing.promptFingerprints.has(promptFingerprint) ||
        seenIdentityKeys.has(identityKey) ||
        seenPromptFingerprints.has(promptFingerprint);
      seenIdentityKeys.add(identityKey);
      seenPromptFingerprints.add(promptFingerprint);
      return { ...question, duplicate };
    });

    return ok({
      importedLevels,
      counts,
      questions,
    });
  });
}

export async function importQuestionChunk(
  input: unknown,
): Promise<ApiResult<{ outcomes: QuestionImportOutcome[] }>> {
  return runAction("question.import", async () => {
    const { admin } = await requireAdmin();
    const parsed = chunkSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    const outcomes = await importQuestionRows(
      parsed.data.examId,
      parsed.data.level,
      parsed.data.questions,
    );

    const created = outcomes.filter((o) => o.status === "created").length;
    const duplicates = outcomes.filter((o) => o.status === "duplicate").length;
    const failed = outcomes.filter((o) => o.status === "error").length;
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "QUESTIONS_IMPORTED",
      entityType: "Exam",
      entityId: parsed.data.examId,
      newValue: { level: parsed.data.level, created, duplicates, failed },
    });

    return ok({ outcomes });
  });
}
