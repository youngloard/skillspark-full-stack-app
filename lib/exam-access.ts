import "server-only";
import type { Exam } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";

// Object-level exam access (M3-S4, FR-3.3). Same contract as
// lib/course-access.ts: OBJECT side only (exam active + a live grant);
// requireStudent owns the subject side. Fail closed.

/**
 * Two indexed EXISTS probes (ARCHITECTURE §5): the batch path
 * (batch_exams by exam ⋈ the student's unique (studentId, batchId) rows),
 * OR the individual path (unique (studentId, examId) within the grant's
 * own window — null bounds are open-ended).
 */
export async function hasExamAccess(studentId: string, examId: string): Promise<boolean> {
  const now = new Date();
  const [batchGrant, individualGrant] = await Promise.all([
    db.batchExam.findFirst({
      where: {
        examId,
        exam: { status: "active" },
        batch: { studentBatches: { some: { studentId } } },
      },
      select: { id: true },
    }),
    db.studentExam.findFirst({
      where: {
        studentId,
        examId,
        exam: { status: "active" },
        OR: [{ accessStartDate: null }, { accessStartDate: { lte: now } }],
        AND: [{ OR: [{ accessEndDate: null }, { accessEndDate: { gte: now } }] }],
      },
      select: { id: true },
    }),
  ]);
  return batchGrant !== null || individualGrant !== null;
}

/**
 * The exam row (settings included) IFF the student can access it — the
 * hasExamAccess condition folded into ONE query so quiz start stays inside
 * its ≤4-query budget. Returns null for inaccessible AND nonexistent alike
 * (fail closed, indistinguishable).
 */
export async function getAccessibleExam(studentId: string, examId: string): Promise<Exam | null> {
  const now = new Date();
  return db.exam.findFirst({
    where: {
      id: examId,
      status: "active",
      OR: [
        { batchExams: { some: { batch: { studentBatches: { some: { studentId } } } } } },
        {
          studentExams: {
            some: {
              studentId,
              OR: [{ accessStartDate: null }, { accessStartDate: { lte: now } }],
              AND: [{ OR: [{ accessEndDate: null }, { accessEndDate: { gte: now } }] }],
            },
          },
        },
      ],
    },
  });
}

/**
 * All unique active exams reachable through either path — the exam-side
 * mirror of getAccessibleCourses. Three indexed queries.
 */
export async function getAccessibleExams(studentId: string): Promise<Exam[]> {
  const now = new Date();
  const [batchGrants, individualGrants] = await Promise.all([
    db.batchExam.findMany({
      where: { batch: { studentBatches: { some: { studentId } } } },
      select: { examId: true },
    }),
    db.studentExam.findMany({
      where: {
        studentId,
        OR: [{ accessStartDate: null }, { accessStartDate: { lte: now } }],
        AND: [{ OR: [{ accessEndDate: null }, { accessEndDate: { gte: now } }] }],
      },
      select: { examId: true },
    }),
  ]);
  const examIds = [...new Set([...batchGrants, ...individualGrants].map((grant) => grant.examId))];
  if (examIds.length === 0) return [];
  return db.exam.findMany({
    where: { id: { in: examIds }, status: "active" },
    orderBy: { name: "asc" },
  });
}
