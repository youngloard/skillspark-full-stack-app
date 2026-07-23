import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createAuditLog } from "./audit";
import { db } from "./db";

const STAMP = `audit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorEmail: { contains: STAMP } } });
  await db.$disconnect();
});

describe("audit helper", () => {
  it("audit-row-shape", async () => {
    await createAuditLog({
      actorId: "actor-1",
      actorEmail: `${STAMP}@test.skillspark.local`,
      actorType: "admin",
      action: "TEST_ACTION",
      entityType: "Student",
      entityId: "entity-1",
      oldValue: { name: "Before" },
      newValue: { name: "After" },
      ipAddress: "1.2.3.4",
      userAgent: "vitest",
    });

    const row = await db.auditLog.findFirstOrThrow({
      where: { actorEmail: `${STAMP}@test.skillspark.local` },
    });
    expect(row).toMatchObject({
      actorId: "actor-1",
      actorType: "admin",
      action: "TEST_ACTION",
      entityType: "Student",
      entityId: "entity-1",
      oldValue: { name: "Before" },
      newValue: { name: "After" },
      ipAddress: "1.2.3.4",
      userAgent: "vitest",
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("never throws even on invalid payload", async () => {
    // actorType has no DB constraint but a create with an oversized/invalid
    // shape must not propagate — helper swallows and logs.
    await expect(
      createAuditLog({
        actorEmail: `${STAMP}@test.skillspark.local`,
        actorType: "system",
        // Oversized incompressible action: exceeds the btree tuple limit of
        // the (action, created_at) index even after TOAST compression,
        // forcing the failure path without a multi-MB network transfer
        // (the old 10MB repeated-"X" payload flaked the 5s test timeout).
        action: randomBytes(8192).toString("hex"),
      }),
    ).resolves.toBeUndefined();
  });
});
