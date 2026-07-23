"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/components/admin/nav-items";

// Path-derived trail so an admin always knows where they are and can step back
// one level (M6-S1). Labels prefer the nav's own wording; deeper/dynamic
// segments (a student code, a course id) are title-cased as a fallback.

const LABELS = new Map(ADMIN_NAV.map((i) => [i.href, i.label]));

function titleCase(segment: string): string {
  return decodeURIComponent(segment)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type Crumb = { label: string; href: string };

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean); // e.g. ["admin","students","abc"]
  const crumbs: Crumb[] = [];
  let href = "";
  for (const part of parts) {
    href += `/${part}`;
    if (href === "/admin") {
      crumbs.push({ label: "Admin", href });
    } else {
      crumbs.push({ label: LABELS.get(href) ?? titleCase(part), href });
    }
  }
  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              {i > 0 && (
                <li aria-hidden="true" className="hidden text-fg-subtle sm:block">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path
                      d="m9 6 6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </li>
              )}
              <li className={`${last ? "block" : "hidden sm:block"} min-w-0`}>
                {last ? (
                  <span aria-current="page" className="block truncate font-medium text-fg">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="block truncate text-fg-muted transition-colors hover:text-fg"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
