import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Role-based landing: the single entry point after sign-in (placeholders live
// at /admin and /dashboard until M4/M6 build the real surfaces).
export default async function Home() {
  const session = await auth();
  const role = session?.user?.role;
  if (!role) redirect("/login");
  if (role === "student") redirect("/dashboard");
  redirect("/admin");
}
