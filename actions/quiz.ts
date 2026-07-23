"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { err, ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { requireStudent } from "@/lib/authorization";
import type { QuizStartResult, SubmitQuizResult } from "@/lib/quiz";
import { startQuiz, submitQuiz } from "@/lib/quiz";
import { checkRateLimit } from "@/lib/rate-limit";

// Student quiz actions. Gate first (active student in window), then the
// object side inside lib/quiz. Starts aren't audited — student reads, not
// admin mutations (FR-9.1); the Attempt is the durable record. Submit allows
// expired-access students (reference rule: an in-flight quiz may be handed
// in even if the account window lapsed mid-quiz) and is rate-limited.

const startSchema = z.object({
  examId: z.string().min(1),
  level: z.string().trim().min(1).max(50),
});

// Bounded submissions (Sec Δ): matrix rows are small; reject absurd payloads.
const submitSchema = z.object({
  quizId: z.string().min(1).max(64),
  submissions: z
    .array(
      z.object({
        questionId: z.string().min(1).max(64),
        rows: z
          .array(
            z.object({
              account: z.string().max(500),
              debit: z.string().max(50),
              credit: z.string().max(50),
            }),
          )
          .max(20),
      }),
    )
    .max(150),
});

export async function startQuizAction(input: unknown): Promise<ApiResult<QuizStartResult>> {
  return runAction("quiz.start", async () => {
    const { student } = await requireStudent();
    const parsed = startSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    return ok(await startQuiz(student.id, parsed.data.examId, parsed.data.level));
  });
}

export async function submitQuizAction(input: unknown): Promise<ApiResult<SubmitQuizResult>> {
  return runAction("quiz.submit", async () => {
    const { student } = await requireStudent({ allowExpiredAccess: true });
    const limit = checkRateLimit("quizSubmit", student.id);
    if (!limit.allowed) {
      return err("RATE_LIMITED", `Too many submissions — try again in ${limit.retryAfterSeconds}s`);
    }
    const parsed = submitSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    return ok(await submitQuiz(student.id, parsed.data.quizId, parsed.data.submissions));
  });
}
