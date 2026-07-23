// Identity invariants shared by every path that touches Admin/Student rows.

/**
 * Canonical email form: trimmed, lowercase. Every read and write of an email
 * column goes through this — the lower(email) unique indexes in the database
 * are the backstop, this is the front door.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
