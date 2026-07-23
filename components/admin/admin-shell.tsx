"use client";

import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";
import { SidebarBody } from "@/components/admin/admin-sidebar";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { ConfirmProvider } from "@/components/admin/confirm-dialog";
import { ToastProvider } from "@/components/admin/toast";
import { useSidebarCollapsed } from "@/components/admin/use-sidebar-collapsed";

// The admin console chrome (M6-S1; retractable rail per owner checkpoint
// 2026-07-18): a fixed left rail on wide laptops (F5) that the admin can
// collapse to an icon rail (choice persists), a full-bleed working area beside
// it, and a sticky header carrying the collapse toggle, breadcrumb trail, and
// theme toggle. Borderless — the rail reads as its own surface, no divider
// lines. On narrow screens the rail collapses into a drawer. Toast + confirm
// providers are mounted here once for every admin page and client child.

type User = { name?: string | null; email?: string | null; image?: string | null };

export function AdminShell({
  isSuperAdmin,
  user,
  signOutAction,
  children,
}: {
  isSuperAdmin: boolean;
  user: User;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMobileDrawer = () => {
    setMobileOpen(false);
    requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  };

  // While the drawer is open: lock scroll + Escape closes it. (Nav links close
  // it via their own onNavigate, so there's no separate route-change effect.)
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-svh bg-bg">
          {/* Desktop rail — sticky, full height, borderless, retractable. */}
          <aside
            className={cn(
              "sticky top-0 hidden h-svh shrink-0 flex-col bg-surface transition-[width] duration-200 ease-[var(--ease-out-standard)] lg:flex",
              collapsed ? "w-[68px]" : "w-[244px]",
            )}
          >
            <SidebarBody
              isSuperAdmin={isSuperAdmin}
              user={user}
              signOutAction={signOutAction}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
            />
          </aside>

          {/* Working column. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-bg/80 px-4 backdrop-blur-md sm:h-16 sm:px-6">
              {/* Mobile: open drawer. */}
              <button
                ref={mobileMenuButtonRef}
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                aria-expanded={mobileOpen}
                className="-ml-1 inline-flex size-11 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:hidden"
              >
                <MenuIcon />
              </button>
              <Breadcrumbs />
              <div className="ml-auto flex items-center gap-1.5">
                <ThemeToggle />
              </div>
            </header>

            <main className="flex-1">{children}</main>
          </div>

          {/* Mobile drawer. */}
          <div
            className={cn(
              "fixed inset-0 z-50 lg:hidden",
              mobileOpen ? "pointer-events-auto" : "pointer-events-none",
            )}
            inert={!mobileOpen}
          >
            <button
              type="button"
              tabIndex={mobileOpen ? 0 : -1}
              aria-label="Close menu"
              onClick={closeMobileDrawer}
              className={cn(
                "absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200",
                mobileOpen ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Admin navigation"
              className={cn(
                "absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-surface transition-transform duration-200 ease-[var(--ease-out-standard)] motion-reduce:transition-none",
                mobileOpen ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <SidebarBody
                isSuperAdmin={isSuperAdmin}
                user={user}
                signOutAction={signOutAction}
                onNavigate={closeMobileDrawer}
              />
            </div>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M3 12h18M3 18h18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
