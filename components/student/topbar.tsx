"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";

// The student app chrome (M4-S1). Viewport-anchored: hugs the true edge with
// its own small margin (DESIGN.md §7), not the centered content well. The
// user menu is a native <details> disclosure — accessible and JS-light.

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/courses", label: "My Courses" },
];

export function StudentTopbar({
  user,
  signOutAction,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-5 sm:h-16 sm:px-8 lg:px-10">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" aria-label="SkillSpark — dashboard" className="shrink-0">
            <Logo className="w-[116px] text-fg" />
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                    active ? "text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <details className="group relative">
            <summary
              className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full py-1 pl-1 pr-2 text-fg-muted transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden"
              aria-label="Account menu"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-fg">
                {initial}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m6 9 6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-[calc(100vw-2.5rem)] max-w-60 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]">
              <div className="px-3 py-2.5">
                {user.name ? (
                  <p className="truncate text-sm font-medium text-fg">{user.name}</p>
                ) : null}
                <p className="truncate text-xs text-fg-muted">{user.email}</p>
              </div>
              <div className="my-1 h-px bg-line" />
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
      <nav
        className="grid h-11 grid-cols-2 border-t border-hairline sm:hidden"
        aria-label="Student sections"
      >
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative grid place-items-center text-sm font-medium transition-colors",
                active ? "text-fg" : "text-fg-muted",
              )}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-accent" />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
