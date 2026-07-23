import { afterAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { gmailCanonicalLocal, resolveLogin, resolveRole } from "./login-resolution";

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const mail = (name: string, domain = "test.skillspark.local") => `${name}-${STAMP}@${domain}`;

const activeWindow = {
  accessStartDate: new Date(Date.now() - 86_400_000),
  accessEndDate: new Date(Date.now() + 86_400_000),
};

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorEmail: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.admin.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("login resolution", () => {
  it("admin-resolves-admin-role (and superadmin auto-promotes from env)", async () => {
    const email = mail("admin");
    await db.admin.create({ data: { name: "Admin", email } });

    const asAdmin = await resolveLogin(email);
    expect(asAdmin).toMatchObject({ outcome: "allowed", role: "admin" });

    const asSuper = await resolveLogin(email, { superAdminEmail: email });
    expect(asSuper).toMatchObject({ outcome: "allowed", role: "superadmin" });
    const row = await db.admin.findUniqueOrThrow({ where: { email } });
    expect(row.isSuperAdmin).toBe(true);

    const audits = await db.auditLog.findMany({
      where: { actorEmail: email, action: "ADMIN_LOGIN" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it("active-student-logs-in (audited + lastLoginAt stamped)", async () => {
    const email = mail("student");
    const student = await db.student.create({
      data: { name: "Student", email, ...activeWindow },
    });

    const result = await resolveLogin(email);
    expect(result).toMatchObject({ outcome: "allowed", role: "student", studentId: student.id });

    const audit = await db.auditLog.findFirst({
      where: { actorEmail: email, action: "STUDENT_LOGIN" },
    });
    expect(audit).not.toBeNull();

    // lastLoginAt stamp is fire-and-forget; poll briefly.
    await new Promise((r) => setTimeout(r, 500));
    const row = await db.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(row.lastLoginAt).not.toBeNull();
  });

  it("expired-student-denied+audited", async () => {
    const email = mail("expired");
    await db.student.create({
      data: {
        name: "Expired",
        email,
        accessStartDate: new Date(Date.now() - 30 * 86_400_000),
        accessEndDate: new Date(Date.now() - 86_400_000),
      },
    });

    expect(await resolveLogin(email)).toEqual({ outcome: "denied" });
    const audit = await db.auditLog.findFirst({
      where: { actorEmail: email, action: "LOGIN_DENIED_EXPIRED_STUDENT" },
    });
    expect(audit).not.toBeNull();
  });

  it("unknown-email-denied+audited", async () => {
    const email = mail("ghost");
    expect(await resolveLogin(email)).toEqual({ outcome: "denied" });
    const audit = await db.auditLog.findFirst({
      where: { actorEmail: email, action: "LOGIN_DENIED_UNREGISTERED_EMAIL" },
    });
    expect(audit).not.toBeNull();
  });

  it("blocked-student-denied", async () => {
    const email = mail("blocked");
    await db.student.create({
      data: { name: "Blocked", email, status: "blocked", ...activeWindow },
    });
    expect(await resolveLogin(email)).toEqual({ outcome: "denied" });
    const audit = await db.auditLog.findFirst({
      where: { actorEmail: email, action: "LOGIN_DENIED_BLOCKED_STUDENT" },
    });
    expect(audit).not.toBeNull();
  });

  it("gmail-dot-variant-heals stored email (audited)", async () => {
    // Admin entered the dotted variant; Google verifies the canonical one.
    const stored = `sk.ill.spark.${STAMP}@gmail.com`;
    const canonical = `${gmailCanonicalLocal(stored)}@gmail.com`;

    const student = await db.student.create({
      data: { name: "Gmail Variant", email: stored, ...activeWindow },
    });

    const result = await resolveLogin(canonical);
    expect(result).toMatchObject({ outcome: "allowed", role: "student", studentId: student.id });

    const healed = await db.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(healed.email).toBe(canonical);
    const audit = await db.auditLog.findFirst({
      where: { entityId: student.id, action: "STUDENT_EMAIL_AUTO_CORRECTED" },
    });
    expect(audit).not.toBeNull();
    // Cleanup: canonical email doesn't contain STAMP after healing.
    await db.auditLog.deleteMany({ where: { entityId: student.id } });
    await db.student.delete({ where: { id: student.id } });
  });

  it("resolveRole is read-only and mirrors outcomes", async () => {
    const email = mail("ro-student");
    await db.student.create({ data: { name: "RO", email, ...activeWindow } });

    const before = await db.auditLog.count({ where: { actorEmail: email } });
    const result = await resolveRole(email);
    expect(result).toMatchObject({ outcome: "allowed", role: "student" });
    const after = await db.auditLog.count({ where: { actorEmail: email } });
    expect(after).toBe(before); // no audit writes on refresh path

    expect(await resolveRole(mail("ro-ghost"))).toEqual({ outcome: "denied" });
  });
});
