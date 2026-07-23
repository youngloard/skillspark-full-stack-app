"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Mark } from "@/components/brand/mark";
import { cn } from "@/lib/cn";
import { useIsClient } from "@/lib/use-is-client";
import { isNavItemActive, visibleNavItems } from "@/components/admin/nav-items";

// The console's primary navigation (M6-S1; retractable per owner checkpoint
// 2026-07-18). Rendered in the desktop rail and the mobile drawer (same body,
// different frame). Editorial, borderless: no divider lines, teal only as the
// active accent, rounded hovers with no outline. `collapsed` (desktop only)
// shrinks it to an icon rail with tooltips.

type User = { name?: string | null; email?: string | null };

export function SidebarBody({
  isSuperAdmin,
  user,
  signOutAction,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  isSuperAdmin: boolean;
  user: User;
  signOutAction: () => Promise<void>;
  onNavigate?: () => void;
  collapsed?: boolean;
  /** Desktop rail only — the mobile drawer has its own close affordance. */
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const mounted = useIsClient();
  const items = visibleNavItems(isSuperAdmin);
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();

  // Collapsed rail: a styled tooltip on hover/focus, portalled to <body> so no
  // ancestor's transform/overflow can clip it (a plain fixed child of the rail
  // gets trapped by the shell's containing block and cut to the 68px width).
  const [tip, setTip] = useState<{ top: number; left: number; label: string } | null>(null);
  const openTip = (e: { currentTarget: HTMLElement }, label: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ top: r.top + r.height / 2, left: r.right + 12, label });
  };
  const closeTip = () => setTip(null);

  return (
    <div className="flex h-full flex-col">
      {/* Brand row doubles as the rail's collapse control. The toggle is
          revealed on hover (and on keyboard focus — a hover-only control would
          be unreachable by keyboard): collapsed, it swaps in over the mark;
          expanded, it sits at the right of the wordmark.

          Reveal keys off :has(:focus-visible), NOT :focus-within — a mouse
          click leaves the button focused, so focus-within kept the mark hidden
          and the icon stuck in its place after toggling. focus-visible is set
          by keyboard focus only, which is exactly who needs the reveal. */}
      <div
        className={cn(
          "group relative flex h-16 shrink-0 items-center",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <Link
          href="/admin"
          aria-label="SkillSpark admin — dashboard"
          className={cn(
            "shrink-0 transition-opacity duration-150 motion-reduce:transition-none",
            // Only the collapsed mark gets swapped out — the wordmark stays put
            // and the toggle sits beside it.
            onToggleCollapsed && collapsed
              ? "group-hover:opacity-0 group-has-[:focus-visible]:opacity-0"
              : "",
          )}
          onClick={onNavigate}
        >
          {collapsed ? <Mark /> : <Logo className="w-[112px] text-fg" />}
        </Link>

        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "grid size-11 place-items-center rounded-md text-fg-muted opacity-0 transition-opacity duration-150",
              "hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              "group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 motion-reduce:transition-none",
              collapsed ? "absolute inset-0 m-auto" : "-mr-1 ml-auto",
            )}
          >
            <PanelIcon collapsed={collapsed} />
          </button>
        ) : null}
      </div>

      <nav
        aria-label="Admin sections"
        className={cn("flex-1 overflow-y-auto py-2", collapsed ? "px-2" : "px-3")}
      >
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  onClick={onNavigate}
                  onMouseEnter={collapsed ? (e) => openTip(e, item.label) : undefined}
                  onMouseLeave={collapsed ? closeTip : undefined}
                  onFocus={collapsed ? (e) => openTip(e, item.label) : undefined}
                  onBlur={collapsed ? closeTip : undefined}
                  className={cn(
                    "group relative flex items-center rounded-md text-sm font-medium transition-colors duration-150",
                    collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
                    active
                      ? "bg-surface-2 text-fg"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {active && !collapsed && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                    />
                  )}
                  <Icon className={cn("shrink-0", active ? "text-accent" : "text-fg-subtle")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("shrink-0", collapsed ? "px-2 py-3" : "p-3")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <span
              title={user.email ?? undefined}
              className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-fg"
            >
              {initial}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="grid h-9 w-9 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <SignOutIcon />
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-md px-2 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-fg">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {user.name ? (
                    <p className="min-w-0 truncate text-[13px] font-medium text-fg">{user.name}</p>
                  ) : null}
                  {isSuperAdmin && (
                    <span
                      title="Super admin"
                      className="shrink-0 rounded bg-surface-2 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] text-accent"
                    >
                      Super
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-fg-muted" title={user.email ?? undefined}>
                  {user.email}
                </p>
              </div>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="mt-1 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <SignOutIcon />
                Sign out
              </button>
            </form>
          </>
        )}
      </div>

      {collapsed && tip && mounted
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[200] -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-[0_10px_28px_-10px_rgba(2,20,20,0.55)]"
              style={{ top: tip.top, left: tip.left }}
            >
              {tip.label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Sidebar toggle — a panel whose left rail is solid while the sidebar is open
 * and hollow once collapsed. Deliberately just two shapes: a frame and the
 * rail. An earlier version also packed a divider and a chevron in here, which
 * at 20px read as clutter rather than an icon. The button's tooltip and
 * aria-label carry the action; the icon only has to carry the state.
 */
function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* app frame */}
      <rect x="3.5" y="5" width="17" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.6" />
      {/* The rail: solid when open, an empty column when collapsed. Inset to
          the frame's INNER edge (4.3 / 5.8, corner radius 3.5 − half-stroke) so
          the outline stays crisp around it — filling to the frame's centreline
          swallowed the stroke and read as a heavy blob. */}
      <path
        d="M9,5.8 H7 A2.7,2.7 0 0 0 4.3,8.5 V15.5 A2.7,2.7 0 0 0 7,18.2 H9 Z"
        fill="currentColor"
        className={cn(
          "transition-opacity duration-200 ease-[var(--ease-out-standard)] motion-reduce:transition-none",
          collapsed ? "opacity-0" : "opacity-100",
        )}
      />
      {/* the rail's edge — the only line that stays put, so the frame never
          looks like an empty box when collapsed */}
      <path d="M9 5v14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
