-- Search + filter performance (admin console).
--
-- Every admin search is an ILIKE '%term%' (Prisma `contains` + insensitive
-- mode). A b-tree index cannot serve a leading-wildcard match, so those
-- searches were sequential scans that grow linearly with the table. pg_trgm
-- GIN indexes make them index-backed instead.
--
-- Prisma can't express operator-class indexes, so (like the functional
-- lower(email) unique) the migration carries them.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Roster search: name / email / student code.
CREATE INDEX IF NOT EXISTS students_name_trgm_idx ON "students" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS students_email_trgm_idx ON "students" USING gin ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS students_code_trgm_idx ON "students" USING gin ("student_code" gin_trgm_ops);

-- Batch search: code / name.
CREATE INDEX IF NOT EXISTS batches_code_trgm_idx ON "batches" USING gin ("batch_code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS batches_name_trgm_idx ON "batches" USING gin ("batch_name" gin_trgm_ops);

-- Course search: name.
CREATE INDEX IF NOT EXISTS courses_name_trgm_idx ON "courses" USING gin ("name" gin_trgm_ops);

-- Question search: prompt.
CREATE INDEX IF NOT EXISTS questions_prompt_trgm_idx ON "questions" USING gin ("prompt" gin_trgm_ops);

-- The roster's default read: filter by status, sort by recency. A composite
-- beats the two single-column indexes for the common "Active + newest" page.
CREATE INDEX IF NOT EXISTS students_status_created_at_idx ON "students" ("status", "created_at" DESC);
