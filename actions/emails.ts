"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { err, ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { renderCustomEmail, renderWelcomeEmail } from "@/lib/email-templates";

// Student email actions (M8). The client sends recipients in chunks so a large
// selection shows progress and never exceeds an action's time budget. Sending
// is sequential inside a chunk — the provider rate-limits bursts, and one bad
// address must not fail the rest.

export type EmailOutcome = { studentId: string; email: string; ok: boolean; error?: string };

const chunkSchema = z
  .object({
    studentIds: z.array(z.string().min(1)).min(1).max(25),
    template: z.enum(["welcome", "custom"]),
    subject: z.string().trim().max(200).optional(),
    message: z.string().trim().max(5_000).optional(),
  })
  .refine((v) => v.template !== "custom" || (v.subject && v.message), {
    message: "A custom email needs a subject and a message",
    path: ["subject"],
  });

export async function sendStudentEmails(
  input: unknown,
): Promise<ApiResult<{ outcomes: EmailOutcome[] }>> {
  return runAction("email.sendStudents", async () => {
    const { admin } = await requireAdmin();
    const parsed = chunkSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    if (!isEmailConfigured()) {
      return err(
        "VALIDATION",
        "Email is not configured on this server — set ZEPTOMAIL_TOKEN and EMAIL_FROM_ADDRESS",
      );
    }

    const { studentIds, template, subject, message } = parsed.data;
    const students = await db.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, email: true },
    });

    const platformUrl = env().EMAIL_PLATFORM_URL;
    const outcomes: EmailOutcome[] = [];

    for (const student of students) {
      const rendered =
        template === "welcome"
          ? renderWelcomeEmail({
              studentName: student.name,
              studentEmail: student.email,
              platformUrl,
            })
          : renderCustomEmail({
              studentName: student.name,
              subject: subject!,
              message: message!,
              platformUrl,
            });

      const result = await sendEmail({
        to: { email: student.email, name: student.name },
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      outcomes.push({
        studentId: student.id,
        email: student.email,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
      });
    }

    const sent = outcomes.filter((o) => o.ok).length;
    const failed = outcomes.length - sent;
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "STUDENT_EMAILS_SENT",
      entityType: "Student",
      entityId: "bulk",
      newValue: {
        template,
        ...(template === "custom" ? { subject } : {}),
        sent,
        failed,
        recipients: outcomes.map((o) => o.email),
      },
    });

    return ok({ outcomes });
  });
}
