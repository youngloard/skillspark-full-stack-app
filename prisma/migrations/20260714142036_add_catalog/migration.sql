-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "layout" TEXT NOT NULL DEFAULT 'module',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "module_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "module_id" TEXT,
    "course_id" TEXT,
    "parent_item_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "item_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "drive_file_id" TEXT,
    "duration" INTEGER,
    "duration_fetched_at" TIMESTAMP(3),
    "source_type" TEXT,
    "storage_path" TEXT,
    "external_url" TEXT,
    "mime_type" TEXT,
    "original_file_name" TEXT,
    "download_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_name_key" ON "courses"("name");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE INDEX "courses_created_at_idx" ON "courses"("created_at");

-- CreateIndex
CREATE INDEX "modules_course_id_module_order_idx" ON "modules"("course_id", "module_order");

-- CreateIndex
CREATE INDEX "content_items_module_id_item_order_idx" ON "content_items"("module_id", "item_order");

-- CreateIndex
CREATE INDEX "content_items_course_id_item_order_idx" ON "content_items"("course_id", "item_order");

-- CreateIndex
CREATE INDEX "content_items_parent_item_id_item_order_idx" ON "content_items"("parent_item_id", "item_order");

-- CreateIndex
CREATE INDEX "content_items_status_idx" ON "content_items"("status");

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Structural invariants the app must never rely on alone (ARCHITECTURE section 4).

-- 1. Type is a closed set.
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_type_check"
  CHECK ("type" IN ('video', 'material'));

-- 2. Exactly one parent: module XOR course XOR parent item.
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_one_parent_check"
  CHECK (num_nonnulls("module_id", "course_id", "parent_item_id") = 1);

-- 3. Videos carry a Drive file id and no material fields.
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_video_fields_check"
  CHECK (
    "type" <> 'video' OR (
      "drive_file_id" IS NOT NULL
      AND "source_type" IS NULL
      AND "storage_path" IS NULL
      AND "external_url" IS NULL
    )
  );

-- 4. Materials carry a valid source with exactly the matching column set,
--    and no video fields.
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_material_fields_check"
  CHECK (
    "type" <> 'material' OR (
      "drive_file_id" IS NULL AND "duration" IS NULL
      AND (
        ("source_type" = 'upload' AND "storage_path" IS NOT NULL AND "external_url" IS NULL)
        OR ("source_type" = 'drive' AND "storage_path" IS NULL AND "external_url" IS NULL)
        OR ("source_type" = 'url' AND "external_url" IS NOT NULL AND "storage_path" IS NULL)
      )
    )
  );

-- 5. Attachments hang off video items only, one level deep. A CHECK cannot
--    reference another row, so a trigger enforces it.
CREATE OR REPLACE FUNCTION check_attachment_parent() RETURNS trigger AS $fn$
DECLARE
  parent_type text;
  parent_parent text;
BEGIN
  IF NEW.parent_item_id IS NOT NULL THEN
    SELECT type, parent_item_id INTO parent_type, parent_parent
      FROM content_items WHERE id = NEW.parent_item_id;
    IF parent_type IS DISTINCT FROM 'video' THEN
      RAISE EXCEPTION 'attachments must hang off a video item';
    END IF;
    IF parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'attachments cannot nest';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER content_items_attachment_parent
  BEFORE INSERT OR UPDATE OF parent_item_id ON content_items
  FOR EACH ROW EXECUTE FUNCTION check_attachment_parent();
