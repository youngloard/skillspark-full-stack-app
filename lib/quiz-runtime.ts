// Pure, client-safe quiz-taking logic (M5-S6) — no React, no server. The
// runner component is a thin wrapper over these so the matrix + timer behaviour
// is testable in node (matrix-rows-add-remove, timer-autosubmits).

// `id` is a stable React key so add/remove/reorder never remounts a row (the
// cause of the input/dropdown "flicker"). It's client-only — stripped before
// submit.
export type MatrixRow = { id: string; account: string; debit: string; credit: string };
export type MatrixField = "account" | "debit" | "credit";

/** Matches the submit action's per-question row cap (Sec Δ). */
export const MAX_MATRIX_ROWS = 20;

let rowSeq = 0;
const newRowId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `row-${Date.now()}-${rowSeq++}`;

const emptyRow = (): MatrixRow => ({ id: newRowId(), account: "", debit: "", credit: "" });

/** Initial rows for a question — defaults to the expected answer-row count. */
export function initRows(count: number): MatrixRow[] {
  return Array.from({ length: Math.max(1, count) }, emptyRow);
}

export function addRow(rows: MatrixRow[]): MatrixRow[] {
  if (rows.length >= MAX_MATRIX_ROWS) return rows;
  return [...rows, emptyRow()];
}

/** Remove a row, but never drop the last one (a question always has ≥1 row). */
export function removeRow(rows: MatrixRow[], index: number): MatrixRow[] {
  if (rows.length <= 1) return rows;
  return rows.filter((_, i) => i !== index);
}

export function setCell(
  rows: MatrixRow[],
  index: number,
  field: MatrixField,
  value: string,
): MatrixRow[] {
  return rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
}

const isBlank = (row: MatrixRow): boolean =>
  row.account.trim() === "" && row.debit.trim() === "" && row.credit.trim() === "";

/** How many rows carry any input (for the "answered" indicator). */
export function filledRowCount(rows: MatrixRow[]): number {
  return rows.filter((row) => !isBlank(row)).length;
}

/** Build the submit payload — drop empty rows and the client-only `id`. */
export function buildSubmissions(
  matrices: Record<string, MatrixRow[]>,
): { questionId: string; rows: { account: string; debit: string; credit: string }[] }[] {
  return Object.entries(matrices).map(([questionId, rows]) => ({
    questionId,
    rows: rows
      .filter((row) => !isBlank(row))
      .map(({ account, debit, credit }) => ({ account, debit, credit })),
  }));
}

// ---- Timer (server authority: everything derives from `expiresAt`) ----

/** Whole seconds left until expiry, floored at 0. */
export function secondsRemaining(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
}

export function isExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs >= expiresAtMs;
}

// ---- Balance check (double-entry: debits must equal credits) ----

/** Parse a money cell (commas stripped) to a number; blank/garbage → 0. */
export function parseAmount(value: string): number {
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export type RowBalance = { debit: number; credit: number; balanced: boolean; hasInput: boolean };

/** Sum debits/credits across a question's rows and whether they balance. */
export function rowBalance(rows: MatrixRow[]): RowBalance {
  let debit = 0;
  let credit = 0;
  let hasInput = false;
  for (const row of rows) {
    if (row.account.trim() || row.debit.trim() || row.credit.trim()) hasInput = true;
    debit += parseAmount(row.debit);
    credit += parseAmount(row.credit);
  }
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.005, hasInput };
}

/** m:ss for the countdown display. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
