import type { SVGProps } from "react";

// The admin console's section map (M6-S1). Data-only + a pure role filter so
// the gating is unit-testable without rendering (see nav-items.test.ts). The
// client sidebar (admin-sidebar.tsx) renders these; later M6 slices fill in
// each destination route. Icons are inline Lucide-style SVGs — the project
// carries no icon dependency (DESIGN.md: "clean Lucide-style icons").

type IconProps = SVGProps<SVGSVGElement>;

function iconProps(props: IconProps) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

const GridIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const UsersIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const LayersIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);

const BookIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z" />
  </svg>
);

const QuestionsIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <path d="M11 12H3M11 6H3M11 18H3" />
    <path d="m15 9 2 2 4-4" />
    <path d="m15 17 2 2 4-4" />
  </svg>
);

const ShieldIcon = (props: IconProps) => (
  <svg {...iconProps(props)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export type AdminNavItem = {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  /** Rendered only for the super admin (destructive/admin-management areas). */
  superadminOnly?: boolean;
};

// Order = the console's information hierarchy: overview, then the entities an
// admin manages daily, then the super-admin-only settings floor.
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: GridIcon },
  { href: "/admin/students", label: "Students", icon: UsersIcon },
  { href: "/admin/batches", label: "Batches", icon: LayersIcon },
  { href: "/admin/courses", label: "Courses", icon: BookIcon },
  { href: "/admin/questions", label: "Questions", icon: QuestionsIcon },
  { href: "/admin/settings", label: "Admins & settings", icon: ShieldIcon, superadminOnly: true },
];

/** The nav a given role may see. Super-admin-only items vanish for plain admins
 *  (defence in depth — the routes themselves also call requireSuperAdmin). */
export function visibleNavItems(isSuperAdmin: boolean): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => !item.superadminOnly || isSuperAdmin);
}

/** Active-section match: exact, or a child route (but "/admin" only matches
 *  itself, never every /admin/* page). Mirrors the reference behaviour. */
export function isNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return item.href !== "/admin" && pathname.startsWith(`${item.href}/`);
}
