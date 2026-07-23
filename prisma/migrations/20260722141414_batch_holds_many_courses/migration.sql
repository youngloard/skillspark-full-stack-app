-- Reverse the one-course-per-batch invariant: a batch may hold MANY courses.
--
-- The 20260719131115 migration added a UNIQUE index on batch_courses(batch_id)
-- to enforce a single course. The owner has since confirmed real batches teach
-- several courses (the legacy data has batches with two), so the restriction is
-- dropped. The composite unique on (batch_id, course_id) stays — it still
-- prevents assigning the SAME course to a batch twice.

DROP INDEX IF EXISTS "batch_courses_batch_id_key";
