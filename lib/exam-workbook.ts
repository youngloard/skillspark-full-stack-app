import "server-only";
import { Workbook, type CellValue, type Worksheet } from "exceljs";
import { DomainError } from "@/lib/errors";

// JET workbook parser — BEHAVIOR-IDENTICAL port of
// _reference/Jet_Exam/src/server/import/workbook.ts (hard project rule).
// Every parsing rule below is byte-for-byte from the reference: named-sheet
// map, single-sheet level markers, header regex, question grouping by "No",
// case-insensitive option dedup keeping first occurrence, comma-stripped
// amounts, and the final prompt+options filter. Deliberate deltas (storage
// concerns only, not parsing behavior): no legacy `${level}-${no}` ids and
// no per-row uuids (our DB mints uuid PKs at insert), and importedAt is
// stamped by the import action, not the parser.

const SHEET_LEVEL_MAP: Record<string, ParsedLevel> = {
  Basic: "basic",
  Medium: "medium",
  Hard: "hard",
};
const LEVEL_ORDER: ParsedLevel[] = ["basic", "medium", "hard"];

export type ParsedLevel = "basic" | "medium" | "hard";

export type ParsedAnswerRow = {
  account: string;
  debit: number | null;
  credit: number | null;
};

export type ParsedQuestion = {
  level: ParsedLevel;
  sourceQuestionNo: string;
  prompt: string;
  options: string[];
  answerRows: ParsedAnswerRow[];
  sheetName: string;
};

export type ParsedWorkbook = {
  importedLevels: ParsedLevel[];
  questions: ParsedQuestion[];
  /** Preview convenience: question count per imported level. */
  counts: Record<ParsedLevel, number>;
};

const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024; // NFR bounded-work cap

type SheetRow = [unknown?, unknown?, unknown?, unknown?, unknown?, unknown?, unknown?, unknown?];

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function cleanText(value: unknown): string {
  return hasValue(value) ? String(value).replace(/\s+/g, " ").trim() : "";
}

function formatQuestionNo(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
  }
  return cleanText(value).replace(/\.0+$/, "");
}

function parseAmount(value: unknown): number | null {
  if (!hasValue(value)) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCellValue(value: CellValue): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const candidate = value as {
    text?: string;
    result?: CellValue;
    richText?: Array<{ text?: string }>;
    error?: string;
  };
  if (typeof candidate.text === "string") {
    return candidate.text;
  }
  if (candidate.result !== undefined) {
    return normalizeCellValue(candidate.result);
  }
  if (Array.isArray(candidate.richText)) {
    return candidate.richText.map((part) => part.text ?? "").join("");
  }
  if (candidate.error) {
    return candidate.error;
  }
  return null;
}

function worksheetToRows(worksheet: Worksheet): SheetRow[] {
  const rows: SheetRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push([
      normalizeCellValue(row.getCell(1).value),
      normalizeCellValue(row.getCell(2).value),
      normalizeCellValue(row.getCell(3).value),
      normalizeCellValue(row.getCell(4).value),
      normalizeCellValue(row.getCell(5).value),
      normalizeCellValue(row.getCell(6).value),
      normalizeCellValue(row.getCell(7).value),
      normalizeCellValue(row.getCell(8).value),
    ]);
  });
  return rows;
}

function isHeaderRow(row: SheetRow): boolean {
  return (
    /^no$/i.test(cleanText(row[0])) &&
    /particulars/i.test(cleanText(row[1])) &&
    /particulars/i.test(cleanText(row[2]))
  );
}

function hasQuestionContent(row: SheetRow): boolean {
  return [row[1], row[2], row[4], row[5], row[6]].some(hasValue);
}

function detectLevelMarker(row: SheetRow): ParsedLevel | null {
  for (const value of row) {
    const normalized = cleanText(value).toLowerCase();
    if (normalized === "basic" || normalized === "medium" || normalized === "hard") {
      return normalized as ParsedLevel;
    }
  }
  return null;
}

function getContiguousContentRanges(rows: SheetRow[]): SheetRow[][] {
  const ranges: SheetRow[][] = [];
  let currentRange: SheetRow[] = [];
  for (const row of rows) {
    if (isHeaderRow(row) || hasQuestionContent(row)) {
      currentRange.push(row);
      continue;
    }
    if (currentRange.length > 0) {
      ranges.push(currentRange);
      currentRange = [];
    }
  }
  if (currentRange.length > 0) {
    ranges.push(currentRange);
  }
  return ranges;
}

function splitRowsByLevelMarkers(
  rows: SheetRow[],
): Array<{ level: ParsedLevel; rows: SheetRow[] }> {
  const markers = rows
    .map((row, index) => ({ index, level: detectLevelMarker(row) }))
    .filter((entry): entry is { index: number; level: ParsedLevel } => entry.level !== null);
  if (!markers.length) {
    return [];
  }
  return markers
    .map((marker, index) => {
      const nextIndex = markers[index + 1]?.index ?? rows.length;
      const sectionRows = rows.slice(marker.index + 1, nextIndex);
      return {
        level: marker.level,
        rows: getContiguousContentRanges(sectionRows).flat(),
      };
    })
    .filter((section) => section.rows.length > 0);
}

function parseRows(rows: SheetRow[], level: ParsedLevel, sheetName: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let current:
    | {
        sourceQuestionNo: string;
        prompt: string;
        options: string[];
        answerRows: ParsedAnswerRow[];
      }
    | undefined;

  const pushCurrent = () => {
    if (!current) {
      return;
    }
    const uniqueOptions: string[] = [];
    const seen = new Set<string>();
    for (const option of current.options) {
      const key = option.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueOptions.push(option);
      }
    }
    questions.push({
      level,
      sourceQuestionNo: current.sourceQuestionNo,
      prompt: current.prompt,
      options: uniqueOptions,
      answerRows: current.answerRows,
      sheetName,
    });
  };

  const dataRows = isHeaderRow(rows[0] ?? []) ? rows.slice(1) : rows;

  for (const row of dataRows) {
    const [no, particularsB, particularsA, , answerDropdown, debit, credit] = row;

    if (hasValue(no)) {
      const sourceQuestionNo = formatQuestionNo(no);
      const prompt = cleanText(particularsB);
      if (!current || current.sourceQuestionNo !== sourceQuestionNo) {
        pushCurrent();
        current = { sourceQuestionNo, prompt, options: [], answerRows: [] };
      } else if (prompt && !current.prompt) {
        current.prompt = prompt;
      }
    }

    if (!current) {
      continue;
    }

    const optionText = cleanText(particularsA);
    if (optionText) {
      current.options.push(optionText);
    }

    const answerText = cleanText(answerDropdown);
    const debitAmount = parseAmount(debit);
    const creditAmount = parseAmount(credit);
    if (answerText || debitAmount !== null || creditAmount !== null) {
      current.answerRows.push({
        account: answerText,
        debit: debitAmount,
        credit: creditAmount,
      });
    }
  }

  pushCurrent();
  return questions.filter((question) => question.prompt && question.options.length > 0);
}

function parseWorkbook(workbook: Workbook): ParsedWorkbook {
  const importedLevels: ParsedLevel[] = [];
  const questions: ParsedQuestion[] = [];

  for (const [sheetName, level] of Object.entries(SHEET_LEVEL_MAP)) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      continue;
    }
    importedLevels.push(level);
    questions.push(...parseRows(worksheetToRows(worksheet), level, sheetName));
  }

  if (importedLevels.length === 0) {
    const inferredSections: Array<{ level: ParsedLevel; rows: SheetRow[]; sheetName: string }> = [];

    for (const worksheet of workbook.worksheets) {
      const rows = worksheetToRows(worksheet);
      const markerSections = splitRowsByLevelMarkers(rows);
      if (markerSections.length > 0) {
        for (const section of markerSections) {
          inferredSections.push({
            level: section.level,
            rows: section.rows,
            sheetName: worksheet.name,
          });
        }
        continue;
      }
      const ranges = getContiguousContentRanges(rows);
      ranges.forEach((rangeRows, index) => {
        inferredSections.push({
          level: LEVEL_ORDER[inferredSections.length] as ParsedLevel,
          rows: rangeRows,
          sheetName: `${worksheet.name} block ${index + 1}`,
        });
      });
    }

    if (inferredSections.length === 0) {
      throw new DomainError(
        "VALIDATION",
        "Workbook must include Basic, Medium, Hard sheets or a single-sheet layout with separated level blocks.",
      );
    }
    if (inferredSections.length > LEVEL_ORDER.length) {
      throw new DomainError(
        "VALIDATION",
        "Detected more than three unnamed question blocks. Use explicit Basic, Medium, Hard markers or separate sheets.",
      );
    }

    inferredSections.forEach((section, index) => {
      const level = section.level ?? LEVEL_ORDER[index];
      if (!importedLevels.includes(level)) {
        importedLevels.push(level);
      }
      questions.push(...parseRows(section.rows, level, section.sheetName));
    });
  }

  if (importedLevels.length === 0) {
    throw new DomainError(
      "VALIDATION",
      "Workbook must include at least one of these sheets: Basic, Medium, Hard.",
    );
  }

  const counts: Record<ParsedLevel, number> = { basic: 0, medium: 0, hard: 0 };
  for (const question of questions) {
    counts[question.level] += 1;
  }
  return { importedLevels, questions, counts };
}

const XLSX_MAGIC = Buffer.from([0x50, 0x4b]); // "PK" — xlsx is a zip container

/**
 * Validated entry point (Sec Δ: size/type checked BEFORE parsing). Throws
 * DomainError with actionable messages; parse errors surface as VALIDATION.
 */
export async function parseQuestionWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  if (buffer.length === 0) {
    throw new DomainError("VALIDATION", "The uploaded file is empty");
  }
  if (buffer.length > MAX_WORKBOOK_BYTES) {
    throw new DomainError("VALIDATION", "The workbook exceeds the 5 MB import limit");
  }
  if (!buffer.subarray(0, 2).equals(XLSX_MAGIC)) {
    throw new DomainError(
      "VALIDATION",
      "Not an .xlsx workbook — export the questions as Excel (.xlsx) and retry",
    );
  }
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
  } catch {
    throw new DomainError(
      "VALIDATION",
      "Could not read the workbook — the file may be corrupted or not a real .xlsx",
    );
  }
  return parseWorkbook(workbook);
}
