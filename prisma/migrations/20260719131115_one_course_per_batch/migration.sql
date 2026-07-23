-- Enforce the invariant: one course per batch.
-- First collapse any batch that currently has multiple courses down to the
-- most-recently-assigned one (tie-break on id), then add a unique index on
-- batch_id so the database rejects a second course going forward.

DELETE FROM "batch_courses" bc
USING "batch_courses" keep
WHERE bc."batch_id" = keep."batch_id"
  AND (
    bc."assigned_at" < keep."assigned_at"
    OR (bc."assigned_at" = keep."assigned_at" AND bc."id" < keep."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "batch_courses_batch_id_key" ON "batch_courses"("batch_id");
