"use server";

import { requireAdmin } from "@/lib/authorization";
import { searchCourses, type CourseSearchHit } from "@/lib/admin-courses";
import { searchBatches, type BatchSearchHit } from "@/lib/admin-batches";

// Type-ahead search for the admin choosers (M6): the course chooser on the
// add-batch form and the batch/course choosers on the add-student form. Admin-
// gated reads returning short match lists; inline-create is handled by the
// existing createCourse / createBatch actions.

export async function searchCoursesAction(q: string): Promise<CourseSearchHit[]> {
  await requireAdmin();
  return searchCourses(q);
}

/** `courseIds` scopes the results so the roster's course → batch filter cascades. */
export async function searchBatchesAction(
  q: string,
  courseIds?: string[],
): Promise<BatchSearchHit[]> {
  await requireAdmin();
  return searchBatches(q, { courseIds });
}
