-- CreateTable
CREATE TABLE "video_progress" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_progress_student_id_updated_at_idx" ON "video_progress"("student_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "video_progress_student_id_item_id_key" ON "video_progress"("student_id", "item_id");

-- AddForeignKey
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
