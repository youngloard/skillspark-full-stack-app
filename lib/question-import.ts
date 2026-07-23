import { parseAmount } from "@/lib/answer-row-parse";

// CSV parsing for the question bulk import (M6-S7). Client-safe. The JET sheet
// is one block per question spanning several rows:
//   col 0 NO            — question number (first row of the block only)
//   col 1 PARTICULARS(B)— the prompt (first row only; may span lines)
//   col 2 PARTICULARS(A)— an option account (one per row)
//   col 3 ANSWER        — a correct answer-row account (one per row)
//   col 4 DR / col 5 CR — that answer row's debit / credit
// A row with a new NO starts the next question; blank rows contribute nothing.
// The file has no level column — the admin picks the target level at import.

export type ParsedAnswerRow = { account: string; debit: number | null; credit: number | null };

export type ParsedQuestion = {
  sourceQuestionNo: string;
  prompt: string;
  options: string[];
  answerRows: ParsedAnswerRow[];
  error: string | null;
  /** Preserved for Excel imports; CSV imports use the generic import label. */
  sheetName?: string;
};

/** Full CSV tokenizer — handles quoted fields containing commas and newlines. */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // ignore — handled with \n
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const clean = (s: string | undefined) => (s ?? "").trim();

export function parseQuestionsCsv(text: string): ParsedQuestion[] {
  const rows = tokenizeCsv(text);
  if (rows.length === 0) return [];

  // Drop a header row: first cell isn't a bare question number.
  const start = /^\d+$/.test(clean(rows[0][0])) ? 0 : 1;

  const out: ParsedQuestion[] = [];
  let cur: Omit<ParsedQuestion, "error"> | null = null;

  const flush = () => {
    if (!cur) return;
    let error: string | null = null;
    if (!cur.prompt) error = "Missing question text";
    else if (cur.options.length === 0) error = "No options listed";
    else if (cur.answerRows.length === 0) error = "No answer rows";
    out.push({ ...cur, error });
    cur = null;
  };

  for (let i = start; i < rows.length; i++) {
    const cells = rows[i];
    const no = clean(cells[0]);
    const prompt = clean(cells[1]);
    const option = clean(cells[2]);
    const answer = clean(cells[3]);

    if (no) {
      flush();
      cur = {
        sourceQuestionNo: no,
        prompt: prompt.replace(/\s+/g, " "),
        options: [],
        answerRows: [],
      };
    }
    if (!cur) continue; // stray rows before the first question

    if (option) cur.options.push(option);
    if (answer) {
      cur.answerRows.push({
        account: answer,
        debit: parseAmount(clean(cells[4])),
        credit: parseAmount(clean(cells[5])),
      });
    }
  }
  flush();
  return out;
}
