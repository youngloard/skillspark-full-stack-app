import "server-only";

import { parseQuestionWorkbook, type ParsedLevel, type ParsedWorkbook } from "@/lib/exam-workbook";
import { DomainError } from "@/lib/errors";

export type QuestionWorkbookImportMode = "full" | "single";

const LEVELS: ParsedLevel[] = ["basic", "medium", "hard"];

/**
 * Full mode preserves detected levels. Single mode requires one populated
 * question block and assigns it to the level selected by the admin.
 */
export async function prepareQuestionWorkbookImport(
  buffer: Buffer,
  mode: QuestionWorkbookImportMode,
  targetLevel?: ParsedLevel,
): Promise<ParsedWorkbook> {
  const parsed = await parseQuestionWorkbook(buffer);

  if (mode === "full") return parsed;

  if (!targetLevel) {
    throw new DomainError("VALIDATION", "Choose the level for this single-level file");
  }

  const populatedLevels = LEVELS.filter((level) => parsed.counts[level] > 0);
  if (populatedLevels.length !== 1) {
    throw new DomainError(
      "VALIDATION",
      "Single-level mode needs a file with one question block. Use Full workbook for files containing multiple levels.",
    );
  }

  const questions = parsed.questions.map((question) => ({ ...question, level: targetLevel }));
  const counts: ParsedWorkbook["counts"] = { basic: 0, medium: 0, hard: 0 };
  counts[targetLevel] = questions.length;

  return { importedLevels: [targetLevel], questions, counts };
}
