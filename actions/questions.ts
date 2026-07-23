"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { auditSnapshot, createAuditLog } from "@/lib/audit";
import { requireAdmin, requireSuperAdmin } from "@/lib/authorization";
import * as questions from "@/lib/questions";

// Question actions (M5-S3). Reference gating tightened per PRD role table:
// selection-based deletes (explicit ids) are admin-level; mass-destructive
// deletes (whole level / everything) require the super admin.

const answerRowSchema = z.object({
  account: z.string().trim().max(500),
  debit: z.number().finite().nullable().optional(),
  credit: z.number().finite().nullable().optional(),
});

const questionBodySchema = z.object({
  sourceQuestionNo: z.string().trim().min(1, "Question number is required").max(64),
  prompt: z.string().trim().min(1, "Prompt is required").max(10_000),
  sheetName: z.string().trim().max(200).optional(),
  options: z.array(z.string().trim().min(1).max(1_000)).min(1, "Add at least one option").max(50),
  answerRows: z.array(answerRowSchema).max(100),
});

const questionCreateSchema = questionBodySchema.extend({
  examId: z.string().min(1),
  level: z.string().trim().min(1).max(50),
});

const questionUpdateSchema = questionBodySchema.extend({ id: z.string().min(1) });

const bulkDeleteSchema = z.object({
  examId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(1_000).optional(),
  level: z.string().trim().min(1).max(50).optional(),
  all: z.literal(true).optional(),
});

const listFilterSchema = z.object({
  examId: z.string().min(1),
  levels: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  level: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

const listSchema = listFilterSchema.extend({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function createQuestion(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("question.create", async () => {
    const { admin } = await requireAdmin();
    const parsed = questionCreateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const question = await questions.createQuestion(parsed.data);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "QUESTION_CREATED",
      entityType: "Question",
      entityId: question.id,
      newValue: auditSnapshot(question),
    });
    return ok({ id: question.id });
  });
}

export async function updateQuestion(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("question.update", async () => {
    const { admin } = await requireAdmin();
    const parsed = questionUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { id, ...body } = parsed.data;
    const { before, after } = await questions.updateQuestion(id, body);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "QUESTION_UPDATED",
      entityType: "Question",
      entityId: id,
      oldValue: auditSnapshot(before),
      newValue: auditSnapshot(after),
    });
    return ok({ id });
  });
}

export async function deleteQuestion(input: unknown): Promise<ApiResult<{ id: string }>> {
  return runAction("question.delete", async () => {
    const { admin } = await requireAdmin();
    const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const question = await questions.deleteQuestion(parsed.data.id);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "QUESTION_DELETED",
      entityType: "Question",
      entityId: question.id,
      oldValue: auditSnapshot(question),
    });
    return ok({ id: question.id });
  });
}

export async function bulkDeleteQuestions(input: unknown): Promise<ApiResult<{ deleted: number }>> {
  return runAction("question.bulk_delete", async () => {
    const { admin } = await requireAdmin();
    const parsed = bulkDeleteSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { examId, ids, level, all } = parsed.data;

    let selector: questions.BulkDeleteSelector;
    if (all) {
      selector = { all: true };
    } else if (level) {
      selector = { level };
    } else if (ids?.length) {
      selector = { ids };
    } else {
      return invalidInput(
        new z.ZodError([
          {
            code: "custom",
            message: "Provide question ids, a level, or all: true",
            path: ["ids"],
            input,
          },
        ]),
      );
    }

    // Mass-destructive (level / all) = super admin; explicit ids = admin.
    // requireSuperAdmin re-reads the request-cached admin row — no extra query.
    if (!("ids" in selector)) await requireSuperAdmin();

    const { deleted } = await questions.bulkDeleteQuestions(examId, selector);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "QUESTIONS_BULK_DELETED",
      entityType: "Exam",
      entityId: examId,
      oldValue: auditSnapshot({ selector, deleted }),
    });
    return ok({ deleted });
  });
}

export async function listQuestions(
  input: unknown,
): Promise<ApiResult<questions.QuestionListPage>> {
  return runAction("question.list", async () => {
    await requireAdmin();
    const parsed = listSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { level, levels, ...filters } = parsed.data;
    return ok(
      await questions.listQuestions({
        ...filters,
        levels: levels ?? (level ? [level] : undefined),
      }),
    );
  });
}

export async function selectAllQuestionIds(
  input: unknown,
): Promise<ApiResult<{ ids: string[]; capped: boolean }>> {
  return runAction("question.select_all", async () => {
    await requireAdmin();
    const parsed = listFilterSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const { level, levels, ...filters } = parsed.data;
    return ok(
      await questions.listAllQuestionIds({
        ...filters,
        levels: levels ?? (level ? [level] : undefined),
      }),
    );
  });
}
