// Numeric parsing for the answer-row editor (M6-S7). Amounts are entered as
// free text (with optional thousands commas) and must land as a finite number
// or null (blank cell). Mirrors the evaluator's comma-strip rule so what admins
// type matches how the quiz grades. Client-safe (no server imports).

export function parseAmount(raw: string): number | null {
  const trimmed = raw.replace(/,/g, "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
