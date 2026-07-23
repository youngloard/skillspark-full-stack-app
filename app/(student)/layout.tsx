import { redirect } from "next/navigation";
import { StudentTopbar } from "@/components/student/topbar";
import { auth, signOut } from "@/lib/auth";

// Student area shell (M4-S1). A fast role guard here; each page additionally
// calls requireStudent for the per-request DB re-check (active + in-window).
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.role !== "student") redirect("/login");

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <StudentTopbar
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
        signOutAction={signOutAction}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
