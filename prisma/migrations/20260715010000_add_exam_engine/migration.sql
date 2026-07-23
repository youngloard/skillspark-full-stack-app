-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "questions_per_quiz" INTEGER NOT NULL DEFAULT 20,
    "time_limit_minutes" INTEGER NOT NULL DEFAULT 30,
    "levels" JSONB NOT NULL DEFAULT '["basic", "medium", "hard"]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source_question_no" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "question_id" TEXT NOT NULL,
    "option_index" INTEGER NOT NULL,
    "option_text" TEXT NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("question_id","option_index")
);

-- CreateTable
CREATE TABLE "answer_rows" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "account" TEXT NOT NULL,
    "debit" DECIMAL(65,30),
    "credit" DECIMAL(65,30),

    CONSTRAINT "answer_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exams_slug_key" ON "exams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "questions_exam_id_level_source_question_no_key" ON "questions"("exam_id", "level", "source_question_no");

-- CreateIndex
CREATE INDEX "answer_rows_question_id_row_index_idx" ON "answer_rows"("question_id", "row_index");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_rows" ADD CONSTRAINT "answer_rows_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-extended (M5-S1): exam settings bounds are DB guarantees, mirroring
-- the reference app's validation (1-100 questions, 1-300 minutes).

ALTER TABLE "exams" ADD CONSTRAINT "exams_questions_per_quiz_check"
  CHECK ("questions_per_quiz" BETWEEN 1 AND 100);

ALTER TABLE "exams" ADD CONSTRAINT "exams_time_limit_minutes_check"
  CHECK ("time_limit_minutes" BETWEEN 1 AND 300);
