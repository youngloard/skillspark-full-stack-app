import "server-only";
import type { Course, Exam } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { getAccessibleCourses } from "@/lib/course-access";
import { getCoursesProgress, type CourseProgressSummary } from "@/lib/course-progress";

// The student dashboard payload (M4-S1). Everything is fetched through the
// access helpers / access-filtered queries — a student only ever sees what
// they're granted (Sec Δ). Kept to ≤4 queries (Perf Δ): getAccessibleCourses
// (2, sequential) runs in parallel with the JET-access probe (1) and the
// continue-learning lookup (1).

export type ContinueLearning = {
  itemId: string;
  itemTitle: string;
  courseId: string;
  courseName: string;
  positionSeconds: number;
};

export type StudentDashboard = {
  courses: Course[];
  /** Per-course completion, keyed by course id (only courses with videos). */
  courseProgress: Record<string, CourseProgressSummary>;
  /** The JET exam row iff the student currently has access; else null. */
  jetExam: Exam | null;
  continueLearning: ContinueLearning | null;
};

export async function getStudentDashboard(studentId: string): Promise<StudentDashboard> {
  const now = new Date();

  const [courses, jetExam, progress] = await Promise.all([
    getAccessibleCourses(studentId),
    // JET access folded into one query: the active 'jet' exam iff reachable
    // via a batch grant OR an in-window individual grant (fail closed).
    db.exam.findFirst({
      where: {
        slug: "jet",
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
    }),
    // Latest incomplete video with a still-active item; course access is
    // re-checked below against the accessible set (no extra query).
    db.videoProgress.findFirst({
      where: { studentId, completed: false, item: { status: "active", type: "video" } },
      orderBy: { updatedAt: "desc" },
      select: {
        itemId: true,
        positionSeconds: true,
        item: {
          select: {
            title: true,
            course: { select: { id: true, name: true } },
            module: { select: { course: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
  ]);

  // Per-course completion (depends on the accessible set, so a 2nd round).
  const courseProgress = await getCoursesProgress(
    studentId,
    courses.map((c) => c.id),
  );

  const accessibleIds = new Set(courses.map((course) => course.id));
  let continueLearning: ContinueLearning | null = null;
  if (progress) {
    const course = progress.item.course ?? progress.item.module?.course ?? null;
    // Only offer resume if the item's course is still accessible + active.
    if (course && accessibleIds.has(course.id)) {
      continueLearning = {
        itemId: progress.itemId,
        itemTitle: progress.item.title,
        courseId: course.id,
        courseName: course.name,
        positionSeconds: progress.positionSeconds,
      };
    }
  }

  return { courses, courseProgress, jetExam, continueLearning };
}
