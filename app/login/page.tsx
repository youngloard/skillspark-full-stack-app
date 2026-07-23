import { redirect } from "next/navigation";
import { LoginShowcase } from "@/components/login/showcase";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth, signIn } from "@/lib/auth";

// The cinematic login (DESIGN.md §9). Google-OAuth-only: the form is a
// server action, so sign-in works with zero JavaScript; the atmosphere and
// the cursor-spark are progressive enhancement. Denials stay uniform — no
// hint whether the email exists.

function GoogleG() {
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
      <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9h-7.3v5.7C6.6 41.1 14.7 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.2-2.9.7-4.3v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 10l7.3-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 14.7 2 6.6 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"
        />
      </svg>
    </span>
  );
}

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth();
  if (session?.user?.role) redirect("/");

  const searchParams = await props.searchParams;
  const denied = typeof searchParams.error === "string";

  return (
    <main className="flex min-h-svh flex-col lg:grid lg:grid-cols-[1fr_1.08fr]">
      {/* Sign-in well — the calm side; full-screen on mobile (form-focused) */}
      <section className="relative z-10 flex min-h-svh flex-1 flex-col bg-bg px-6 py-7 sm:px-10 lg:col-start-1 lg:min-h-0 lg:px-16 lg:py-10">
        <header className="flex items-center justify-between">
          <Logo className="w-[132px] text-fg" />
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center py-8">
          <div className="w-full max-w-sm">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">
              The SkillSpark platform
            </p>
            <h1 className="mt-4 font-display text-[2.4rem] font-semibold leading-[1.08] tracking-tight text-balance sm:text-[3.1rem]">
              Learn it. Practise it. <span className="text-accent">Prove it.</span>
            </h1>
            <p className="mt-4 text-[0.975rem] leading-relaxed text-fg-muted">
              Your video courses, study materials, and the JET accounting exam — together in one
              account.
            </p>

            <form
              className="mt-8"
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-3 rounded-md bg-accent py-3.5 pl-4 pr-5 text-[0.95rem] font-medium text-accent-fg shadow-sm transition-colors duration-150 hover:bg-accent-hover focus-visible:outline-none"
              >
                <GoogleG />
                Continue with Google
              </button>
            </form>

            {denied ? (
              <div
                role="alert"
                className="mt-5 rounded-md border border-danger/25 bg-danger/8 px-4 py-3 text-sm text-danger"
              >
                Sign-in failed. Your account may not be registered, or your access may have ended —
                contact your admin.
              </div>
            ) : null}

            <p className="mt-6 text-[0.8rem] leading-relaxed text-fg-subtle">
              Use the Google account your admin registered. Trouble signing in? Reach out to your
              coordinator.
            </p>
          </div>
        </div>

        <footer className="text-[0.78rem] text-fg-subtle">
          skillspark.study · Learn, practise, prove.
        </footer>
      </section>

      {/* Product showcase — desktop only; mobile stays a clean, fast form */}
      <div className="relative hidden lg:col-start-2 lg:block">
        <LoginShowcase />
      </div>
    </main>
  );
}
