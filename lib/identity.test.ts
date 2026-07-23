import { afterAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { normalizeEmail } from "./identity";

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const mail = (name: string) => `${name}-${STAMP}@test.skillspark.local`;

afterAll(async () => {
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.admin.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("identity schema", () => {
  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Ana.STUDENT@Gmail.COM ")).toBe("ana.student@gmail.com");
  });

  it("email-unique-case-insensitive (DB-level backstop)", async () => {
    await db.student.create({
      data: {
        name: "Case One",
        email: mail("case"),
        accessStartDate: new Date(),
        accessEndDate: new Date(Date.now() + 86_400_000),
      },
    });
    // Bypass the code-level normalization on purpose: the lower(email) unique
    // index must reject a same-address-different-case duplicate.
    await expect(
      db.student.create({
        data: {
          name: "Case Two",
          email: mail("case").toUpperCase(),
          accessStartDate: new Date(),
          accessEndDate: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrowError();
  });

  it("studentcode-null-allowed-dup-null-ok", async () => {
    const base = {
      accessStartDate: new Date(),
      accessEndDate: new Date(Date.now() + 86_400_000),
    };
    const a = await db.student.create({
      data: { name: "NoCode A", email: mail("nocode-a"), studentCode: null, ...base },
    });
    const b = await db.student.create({
      data: { name: "NoCode B", email: mail("nocode-b"), studentCode: null, ...base },
    });
    expect(a.id).not.toBe(b.id);

    // But a real studentCode is unique.
    await db.student.create({
      data: { name: "Code A", email: mail("code-a"), studentCode: `SC-${STAMP}`, ...base },
    });
    await expect(
      db.student.create({
        data: { name: "Code B", email: mail("code-b"), studentCode: `SC-${STAMP}`, ...base },
      }),
    ).rejects.toThrowError();
  });

  it("seed-idempotent (upsert semantics)", async () => {
    const email = normalizeEmail(mail("seed-admin"));
    for (let i = 0; i < 2; i += 1) {
      await db.admin.upsert({
        where: { email },
        update: { isSuperAdmin: true, status: "active" },
        create: { email, name: "Seed Admin", isSuperAdmin: true, status: "active" },
      });
    }
    const rows = await db.admin.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isSuperAdmin).toBe(true);
  });
});
