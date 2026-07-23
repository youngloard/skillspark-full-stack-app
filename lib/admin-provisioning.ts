import "server-only";
import { db } from "@/lib/db";
import * as batches from "@/lib/batches";

// Find-or-create helpers shared by the bulk importer and the admin choosers
// (M6). Creating a batch from just a name needs a unique batchCode, so we
// derive one and resolve collisions here in one place.

function sanitizeCode(name: string): string {
  const base = name
    .replace(/[^A-Za-z0-9 _-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || "BATCH";
}

async function uniqueBatchCode(name: string): Promise<string> {
  const base = sanitizeCode(name).slice(0, 56);
  for (let n = 1; n < 100; n++) {
    const code = n === 1 ? base : `${base}-${n}`;
    const clash = await db.batch.findUnique({ where: { batchCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  return `${base}-${Date.now()}`;
}

export type ProvisionedBatch = {
  id: string;
  batchCode: string;
  batchName: string;
  /** The batch's existing courses, when this resolved to an EXISTING batch. */
  courses: { id: string; name: string }[];
};

/** Find a batch by exact name, or create it with a derived unique code. */
export async function findOrCreateBatchByName(name: string): Promise<ProvisionedBatch> {
  const found = await db.batch.findFirst({
    where: { batchName: name },
    select: {
      id: true,
      batchCode: true,
      batchName: true,
      batchCourses: { select: { course: { select: { id: true, name: true } } } },
    },
  });
  if (found) {
    return {
      id: found.id,
      batchCode: found.batchCode,
      batchName: found.batchName,
      courses: found.batchCourses.map((bc) => bc.course),
    };
  }
  const batch = await batches.createBatch({
    batchCode: await uniqueBatchCode(name),
    batchName: name,
    courseIds: [],
  });
  return {
    id: batch.id,
    batchCode: batch.batchCode,
    batchName: batch.batchName,
    courses: [],
  };
}

/** Find a course by unique name, or create it (module layout by default). */
export async function findOrCreateCourseByName(
  name: string,
): Promise<{ id: string; name: string }> {
  return db.course.upsert({
    where: { name },
    update: {},
    create: { name },
    select: { id: true, name: true },
  });
}

/**
 * Assign one course to many batches. A batch may hold several courses, so this
 * only ever ADDS: batches already on this course are skipped, which makes a
 * re-run a safe no-op.
 */
export async function assignCourseToBatches(
  batchIds: string[],
  courseId: string,
): Promise<{ assigned: number; alreadyHad: number }> {
  if (batchIds.length === 0) return { assigned: 0, alreadyHad: 0 };
  const result = await db.batchCourse.createMany({
    data: batchIds.map((batchId) => ({ batchId, courseId })),
    skipDuplicates: true,
  });
  return { assigned: result.count, alreadyHad: batchIds.length - result.count };
}

/** Add a course to a batch; assigning one it already has is a no-op. */
export async function linkBatchToCourse(batchId: string, courseId: string): Promise<void> {
  await db.batchCourse.upsert({
    where: { batchId_courseId: { batchId, courseId } },
    update: {},
    create: { batchId, courseId },
  });
}
