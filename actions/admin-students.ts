"use server";

import { requireAdmin } from "@/lib/authorization";
import {
  listAllStudentIds,
  searchStudents,
  type StudentSearchHit,
  type StudentStatusFilter,
} from "@/lib/admin-students";

// Type-ahead search for the dashboard "jump to student" box (M6-S3). Admin-
// gated read; returns a short match list (id/name/email/code) the client links
// to the student's profile.
export async function searchStudentsAction(q: string): Promise<StudentSearchHit[]> {
  await requireAdmin();
  return searchStudents(q);
}

// "Select all N matching" on the roster: return every student ID for the
// current filter (bounded), so the client can act on the whole result set —
// not just the visible page.
export async function selectAllStudentIdsAction(filters: {
  q?: string;
  status?: StudentStatusFilter;
  courseIds?: string[];
  batchIds?: string[];
}): Promise<{ ids: string[]; capped: boolean }> {
  await requireAdmin();
  return listAllStudentIds(filters);
}
