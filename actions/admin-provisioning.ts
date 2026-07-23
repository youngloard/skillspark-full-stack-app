"use server";

import { z } from "zod";
import type { ApiResult } from "@/lib/api-response";
import { ok } from "@/lib/api-response";
import { invalidInput, runAction } from "@/lib/action-runner";
import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/authorization";
import { findOrCreateBatchByName, type ProvisionedBatch } from "@/lib/admin-provisioning";

// Provisioning action for the admin choosers (M6): create-a-batch-by-name from
// the add-student chooser. Course creation reuses createCourse, and attaching a
// course to a batch reuses assignCourseToBatch in actions/batches.ts.

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function ensureBatchByName(input: unknown): Promise<ApiResult<ProvisionedBatch>> {
  return runAction("batch.ensureByName", async () => {
    const { admin } = await requireAdmin();
    const parsed = nameSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);
    const batch = await findOrCreateBatchByName(parsed.data.name);
    await createAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorType: "admin",
      action: "BATCH_ENSURED",
      entityType: "Batch",
      entityId: batch.id,
      newValue: { batchCode: batch.batchCode, batchName: batch.batchName },
    });
    return ok(batch);
  });
}
