import "server-only";
import { redirect } from "next/navigation";
import {
  AuthorizationError,
  requireAdmin,
  requireSuperAdmin,
  type AdminContext,
} from "@/lib/authorization";

// The /admin layout guard (M6-S1). One place decides who may render any admin
// route: requireAdmin does the DB re-check (active admin/superadmin), and any
// authorization failure — no session, wrong role, deactivated account — sends
// the request to /login rather than leaking an error boundary. The proxy layer
// only pre-filters on a session cookie; this is the real trust boundary.

export async function guardAdminAccess(): Promise<AdminContext> {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/login");
    throw error;
  }
}

/**
 * Superadmin-only route guard (M6-S9). A plain admin is sent to the console
 * home (they're authenticated, just not permitted here); anyone unauthenticated
 * goes to /login.
 */
export async function guardSuperAdminAccess(): Promise<AdminContext> {
  try {
    return await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(error.code === "FORBIDDEN" ? "/admin" : "/login");
    }
    throw error;
  }
}
