import "server-only";
import type { Student } from "@/lib/generated/prisma/client";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/identity";

// Login resolution (ARCHITECTURE §3): admin first, then student, else deny —
// every denial audited. Behavior ported from the reference app's lib/auth.ts,
// including its production lesson: Gmail dot/plus-variant healing.

export type AppRole = "superadmin" | "admin" | "student";

export type LoginResolution =
  | { outcome: "allowed"; role: AppRole; adminId?: string; studentId?: string }
  | { outcome: "denied" };

/**
 * Gmail treats dots and +tags in the local part as insignificant. Admins often
 * enter a dot-variant of the address Google actually reports at OAuth time.
 * Returns the canonical local part, or null for non-Gmail domains.
 * (Also consumed by M3-S2's student-create duplicate guard.)
 */
export function gmailCanonicalLocal(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1);
  if (domain !== "gmail.com" && domain !== "googlemail.com") return null;
  return email.slice(0, at).split("+")[0]!.replace(/\./g, "");
}

/**
 * Resolve a student by the email Google verified: exact match first, then
 * Gmail-canonical fallback. A variant match auto-corrects the stored email to
 * the verified address (audited) so future logins take the fast indexed path.
 */
async function findStudentByOAuthEmail(rawEmail: string): Promise<Student | null> {
  const email = normalizeEmail(rawEmail);
  const exact = await db.student.findUnique({ where: { email } });
  if (exact) return exact;

  const canon = gmailCanonicalLocal(email);
  if (!canon) return null;
  // Only runs on a lookup miss for a Gmail address; bounded by gmail rows.
  const gmailStudents = await db.student.findMany({
    where: {
      OR: [{ email: { endsWith: "@gmail.com" } }, { email: { endsWith: "@googlemail.com" } }],
    },
  });
  const match = gmailStudents.find((s) => gmailCanonicalLocal(s.email) === canon);
  if (!match) return null;

  try {
    const healed = await db.student.update({ where: { id: match.id }, data: { email } });
    await createAuditLog({
      actorId: match.id,
      actorEmail: email,
      actorType: "system",
      action: "STUDENT_EMAIL_AUTO_CORRECTED",
      entityType: "Student",
      entityId: match.id,
      oldValue: { email: match.email },
      newValue: { email, reason: "gmail dot/plus variant verified by Google OAuth" },
    });
    return healed;
  } catch {
    // Unique collision or transient failure — proceed with the matched row;
    // healing can succeed on a later login.
    return match;
  }
}

/**
 * Light role resolution for JWT refreshes: read-only (no audit rows, no
 * lastLoginAt stamp, no healing) so it can run on every session read. One or
 * two indexed lookups.
 */
export async function resolveRole(rawEmail: string): Promise<LoginResolution> {
  const email = normalizeEmail(rawEmail);
  const admin = await db.admin.findUnique({ where: { email } });
  if (admin) {
    if (admin.status !== "active") return { outcome: "denied" };
    return {
      outcome: "allowed",
      role: admin.isSuperAdmin ? "superadmin" : "admin",
      adminId: admin.id,
    };
  }
  const student = await db.student.findUnique({ where: { email } });
  if (!student || student.status === "blocked") return { outcome: "denied" };
  const now = new Date();
  if (student.accessEndDate < now || student.accessStartDate > now) return { outcome: "denied" };
  return { outcome: "allowed", role: "student", studentId: student.id };
}

/**
 * Full sign-in decision. Writes login/denial audit rows, stamps lastLoginAt,
 * and auto-promotes the SUPER_ADMIN_EMAIL account (env changes must win over
 * a stale flag). `superAdminEmail` is injected for testability.
 */
export async function resolveLogin(
  rawEmail: string,
  options: { superAdminEmail?: string } = {},
): Promise<LoginResolution> {
  const email = normalizeEmail(rawEmail);

  const admin = await db.admin.findUnique({ where: { email } });
  if (admin) {
    if (admin.status !== "active") {
      await createAuditLog({
        actorEmail: email,
        actorType: "system",
        action: "LOGIN_DENIED_BLOCKED_ADMIN",
        entityType: "Admin",
        entityId: admin.id,
      });
      return { outcome: "denied" };
    }
    let isSuperAdmin = admin.isSuperAdmin;
    if (!isSuperAdmin && options.superAdminEmail === email) {
      await db.admin.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
      isSuperAdmin = true;
    }
    await createAuditLog({
      actorId: admin.id,
      actorEmail: email,
      actorType: "admin",
      action: "ADMIN_LOGIN",
    });
    return { outcome: "allowed", role: isSuperAdmin ? "superadmin" : "admin", adminId: admin.id };
  }

  const student = await findStudentByOAuthEmail(email);
  if (!student) {
    await createAuditLog({
      actorEmail: email,
      actorType: "system",
      action: "LOGIN_DENIED_UNREGISTERED_EMAIL",
    });
    return { outcome: "denied" };
  }
  if (student.status === "blocked") {
    await createAuditLog({
      actorId: student.id,
      actorEmail: email,
      actorType: "system",
      action: "LOGIN_DENIED_BLOCKED_STUDENT",
      entityType: "Student",
      entityId: student.id,
    });
    return { outcome: "denied" };
  }
  const now = new Date();
  if (student.accessEndDate < now || student.accessStartDate > now) {
    await createAuditLog({
      actorId: student.id,
      actorEmail: email,
      actorType: "system",
      action: "LOGIN_DENIED_EXPIRED_STUDENT",
      entityType: "Student",
      entityId: student.id,
    });
    return { outcome: "denied" };
  }

  await createAuditLog({
    actorId: student.id,
    actorEmail: email,
    actorType: "student",
    action: "STUDENT_LOGIN",
  });
  // Roster shows who has actually logged in. Fire-and-forget — a failed stamp
  // must never block a legitimate sign-in.
  void db.student
    .update({ where: { id: student.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  return { outcome: "allowed", role: "student", studentId: student.id };
}
