import "server-only";
import { cache } from "react";
import type { Admin, Student } from "@/lib/generated/prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// The trust boundary (ARCHITECTURE §3). Every server action and data-touching
// route calls one of these FIRST. The JWT names a role, but status/expiry are
// re-read from the database each request so blocking takes effect on the very
// next request, not at token expiry. Lookups are request-deduped via cache().

export class AuthorizationError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN";
  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(message);
    this.code = code;
  }
}

const getSession = cache(async () => auth());

const getAdminById = cache(async (id: string) => db.admin.findUnique({ where: { id } }));

const getStudentById = cache(async (id: string) => db.student.findUnique({ where: { id } }));

export type AdminContext = { admin: Admin; isSuperAdmin: boolean };

/** Admin or superadmin with a live active row — everything else throws. */
export async function requireAdmin(): Promise<AdminContext> {
  const session = await getSession();
  const role = session?.user?.role;
  const adminId = session?.user?.adminId;
  if (!session || (role !== "admin" && role !== "superadmin") || !adminId) {
    throw new AuthorizationError("UNAUTHORIZED", "Sign in as an admin to continue");
  }
  const admin = await getAdminById(adminId);
  if (!admin || admin.status !== "active") {
    throw new AuthorizationError("FORBIDDEN", "This admin account is not active");
  }
  return { admin, isSuperAdmin: admin.isSuperAdmin };
}

/** Super admin only (destructive/bulk operations, admin management). */
export async function requireSuperAdmin(): Promise<AdminContext> {
  const context = await requireAdmin();
  if (!context.isSuperAdmin) {
    throw new AuthorizationError("FORBIDDEN", "This action requires the super admin");
  }
  return context;
}

export type StudentContext = { student: Student };

/**
 * Active student inside their access window. `allowExpiredAccess` keeps
 * read-only surfaces (e.g. past scores) reachable after expiry when a slice
 * explicitly opts in.
 */
export async function requireStudent(
  options: { allowExpiredAccess?: boolean } = {},
): Promise<StudentContext> {
  const session = await getSession();
  if (!session || session.user?.role !== "student" || !session.user.studentId) {
    throw new AuthorizationError("UNAUTHORIZED", "Sign in as a student to continue");
  }
  const student = await getStudentById(session.user.studentId);
  if (!student || student.status !== "active") {
    throw new AuthorizationError("FORBIDDEN", "This student account is not active");
  }
  if (!options.allowExpiredAccess) {
    const now = new Date();
    if (student.accessEndDate < now || student.accessStartDate > now) {
      throw new AuthorizationError("FORBIDDEN", "Your access period has ended");
    }
  }
  return { student };
}
