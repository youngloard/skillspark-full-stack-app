import { describe, expect, it } from "vitest";
import { ADMIN_NAV, isNavItemActive, visibleNavItems } from "./nav-items";

describe("admin nav gating", () => {
  it("superadmin-items-hidden-for-admin", () => {
    const forAdmin = visibleNavItems(false);
    const forSuper = visibleNavItems(true);

    // A plain admin never sees a superadmin-only entry…
    expect(forAdmin.some((i) => i.superadminOnly)).toBe(false);
    expect(forAdmin.map((i) => i.href)).not.toContain("/admin/settings");

    // …and the super admin sees strictly more (every admin item plus the gated ones).
    expect(forSuper.length).toBeGreaterThan(forAdmin.length);
    expect(forSuper.map((i) => i.href)).toEqual(ADMIN_NAV.map((i) => i.href));
    expect(forAdmin.every((i) => forSuper.some((s) => s.href === i.href))).toBe(true);

    // At least one item is actually gated (guards against the flag being dropped).
    expect(ADMIN_NAV.some((i) => i.superadminOnly)).toBe(true);
  });

  it("active-match is exact for dashboard, prefix for sections", () => {
    const dashboard = ADMIN_NAV[0];
    const students = ADMIN_NAV.find((i) => i.href === "/admin/students")!;

    // "/admin" must not light up on every child route…
    expect(isNavItemActive(dashboard, "/admin")).toBe(true);
    expect(isNavItemActive(dashboard, "/admin/students")).toBe(false);

    // …but a section owns its own subtree.
    expect(isNavItemActive(students, "/admin/students")).toBe(true);
    expect(isNavItemActive(students, "/admin/students/abc")).toBe(true);
    expect(isNavItemActive(students, "/admin/batches")).toBe(false);
  });
});
