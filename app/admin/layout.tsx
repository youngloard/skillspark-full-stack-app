import { signOut } from "@/lib/auth";
import { guardAdminAccess } from "@/lib/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";

// Admin area shell (M6-S1). The layout guard is the trust boundary: it does the
// DB re-check (active admin/superadmin) and redirects anyone else to /login
// before any admin UI renders. isSuperAdmin flows into the shell so gated nav
// (and later, gated actions) resolve from the live role, not the JWT alone.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin, isSuperAdmin } = await guardAdminAccess();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminShell
      isSuperAdmin={isSuperAdmin}
      user={{ name: admin.name, email: admin.email }}
      signOutAction={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
