import "server-only";
import type { Student } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isFkViolation, isUniqueViolation } from "@/lib/errors";
import { normalizeEmail } from "@/lib/identity";
import { gmailCanonicalLocal } from "@/lib/login-resolution";

// Student domain (M3-S2). Email is the identity key: every write goes through
// normalizeEmail, and Gmail addresses get the canonical-duplicate guard —
// Gmail ignores dots/+tags, so lekshmi.fr@ and lekshmifr@ are the same person
// and must not become two student rows (the login healer can't merge rows).

/**
 * Rejects a Gmail address whose canonical form collides with a different
 * existing student. Bounded scan over gmail rows (same approach as the login
 * healer; admin-rare path). If bulk creation ever gets hot at 100k students,
 * escalate to a generated canonical-email column + unique index.
 */
async function assertNoGmailCanonicalDuplicate(email: string, excludeId?: string): Promise<void> {
  const canon = gmailCanonicalLocal(email);
  if (!canon) return;
  const gmailStudents = await db.student.findMany({
    where: {
      OR: [{ email: { endsWith: "@gmail.com" } }, { email: { endsWith: "@googlemail.com" } }],
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, email: true },
  });
  const match = gmailStudents.find((s) => gmailCanonicalLocal(s.email) === canon);
  if (match) {
    throw new DomainError(
      "CONFLICT",
      "A student with an equivalent Gmail address already exists — Gmail ignores dots and +tags, so this would be a duplicate",
      { email: "Equivalent Gmail address already registered" },
    );
  }
}

const DUPLICATE_MESSAGE = "A student with this email or student code already exists";

export type StudentCreateData = {
  name: string;
  email: string;
  studentCode?: string;
  batchIds?: string[];
  accessStartDate: Date;
  accessEndDate: Date;
};

/** Creates the student and initial batch assignments in one transaction. */
export async function createStudent(data: StudentCreateData): Promise<Student> {
  const email = normalizeEmail(data.email);
  await assertNoGmailCanonicalDuplicate(email);
  try {
    return await db.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          name: data.name,
          email,
          studentCode: data.studentCode ?? null,
          accessStartDate: data.accessStartDate,
          accessEndDate: data.accessEndDate,
        },
      });
      if (data.batchIds?.length) {
        await tx.studentBatch.createMany({
          data: data.batchIds.map((batchId) => ({ studentId: student.id, batchId })),
          skipDuplicates: true,
        });
      }
      return student;
    });
  } catch (cause) {
    if (isUniqueViolation(cause)) throw new DomainError("CONFLICT", DUPLICATE_MESSAGE);
    if (isFkViolation(cause))
      throw new DomainError("NOT_FOUND", "A selected batch no longer exists");
    throw cause;
  }
}

export type StudentUpdateData = {
  name?: string;
  email?: string;
  studentCode?: string | null;
  status?: "active" | "blocked";
  accessStartDate?: Date;
  accessEndDate?: Date;
};

export async function updateStudent(
  id: string,
  data: StudentUpdateData,
): Promise<{ before: Student; after: Student }> {
  const before = await db.student.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Student not found");

  // Merged-window rule: the window must stay valid against whichever half is
  // NOT being changed (the reference app only checked pairs — a lone new end
  // date could land before the existing start).
  const mergedStart = data.accessStartDate ?? before.accessStartDate;
  const mergedEnd = data.accessEndDate ?? before.accessEndDate;
  if (mergedEnd < mergedStart) {
    throw new DomainError("VALIDATION", "Access end date must be on or after the start date", {
      accessEndDate: "Ends before the access window starts",
    });
  }

  const email = data.email !== undefined ? normalizeEmail(data.email) : undefined;
  if (email !== undefined && email !== before.email) {
    await assertNoGmailCanonicalDuplicate(email, id);
  }

  try {
    const after = await db.student.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(email !== undefined && { email }),
        ...(data.studentCode !== undefined && { studentCode: data.studentCode }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.accessStartDate !== undefined && { accessStartDate: data.accessStartDate }),
        ...(data.accessEndDate !== undefined && { accessEndDate: data.accessEndDate }),
      },
    });
    return { before, after };
  } catch (cause) {
    if (isUniqueViolation(cause)) throw new DomainError("CONFLICT", DUPLICATE_MESSAGE);
    throw cause;
  }
}

export async function deleteStudent(id: string): Promise<{ student: Student; batchCount: number }> {
  const batchCount = await db.studentBatch.count({ where: { studentId: id } });
  try {
    // DELETE … RETURNING — the deleted row doubles as the audit snapshot.
    const student = await db.student.delete({ where: { id } });
    return { student, batchCount };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025") {
      throw new DomainError("NOT_FOUND", "Student not found");
    }
    throw cause;
  }
}
