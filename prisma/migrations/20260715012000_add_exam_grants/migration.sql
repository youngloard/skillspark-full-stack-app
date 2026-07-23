-- CreateTable
CREATE TABLE "batch_exams" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_exams" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "access_start_date" TIMESTAMP(3),
    "access_end_date" TIMESTAMP(3),
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_exams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_exams_exam_id_idx" ON "batch_exams"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "batch_exams_batch_id_exam_id_key" ON "batch_exams"("batch_id", "exam_id");

-- CreateIndex
CREATE INDEX "student_exams_exam_id_idx" ON "student_exams"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_exams_student_id_exam_id_key" ON "student_exams"("student_id", "exam_id");

-- AddForeignKey
ALTER TABLE "batch_exams" ADD CONSTRAINT "batch_exams_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_exams" ADD CONSTRAINT "batch_exams_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exams" ADD CONSTRAINT "student_exams_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exams" ADD CONSTRAINT "student_exams_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-extended (M3-S4): an individual grant's window must be coherent.
ALTER TABLE "student_exams" ADD CONSTRAINT "student_exams_window_check"
  CHECK ("access_start_date" IS NULL OR "access_end_date" IS NULL
         OR "access_end_date" >= "access_start_date");
