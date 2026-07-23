-- AlterTable
ALTER TABLE "video_progress" ADD COLUMN     "watch_seconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "material_downloads" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_downloads_item_id_idx" ON "material_downloads"("item_id");

-- CreateIndex
CREATE INDEX "material_downloads_created_at_idx" ON "material_downloads"("created_at");

-- CreateIndex
CREATE INDEX "material_downloads_student_id_idx" ON "material_downloads"("student_id");

-- AddForeignKey
ALTER TABLE "material_downloads" ADD CONSTRAINT "material_downloads_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_downloads" ADD CONSTRAINT "material_downloads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
