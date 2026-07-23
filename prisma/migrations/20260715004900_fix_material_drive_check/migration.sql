-- Corrective migration (M2-S4): the M2-S1 material CHECK forbade
-- drive_file_id on ALL materials, but ARCHITECTURE §4 defines driveFileId as
-- a material field — a drive-source material stores its file pointer there.
-- Forward-only fix per the migration rules: drop and re-add the constraint
-- with the drive branch requiring drive_file_id (and the other branches
-- explicitly excluding it, which the old version implied globally).

ALTER TABLE "content_items" DROP CONSTRAINT "content_items_material_fields_check";

ALTER TABLE "content_items" ADD CONSTRAINT "content_items_material_fields_check"
  CHECK (
    "type" <> 'material' OR (
      "duration" IS NULL
      AND (
        ("source_type" = 'upload' AND "storage_path" IS NOT NULL
          AND "external_url" IS NULL AND "drive_file_id" IS NULL)
        OR ("source_type" = 'drive' AND "drive_file_id" IS NOT NULL
          AND "storage_path" IS NULL AND "external_url" IS NULL)
        OR ("source_type" = 'url' AND "external_url" IS NOT NULL
          AND "storage_path" IS NULL AND "drive_file_id" IS NULL)
      )
    )
  );
