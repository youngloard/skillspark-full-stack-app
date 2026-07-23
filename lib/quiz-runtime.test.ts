import { describe, expect, it } from "vitest";
import {
  MAX_MATRIX_ROWS,
  addRow,
  buildSubmissions,
  filledRowCount,
  formatCountdown,
  initRows,
  isExpired,
  parseAmount,
  removeRow,
  rowBalance,
  secondsRemaining,
  setCell,
  type MatrixRow,
} from "./quiz-runtime";

// M5-S6: the pure quiz-taking logic (no DOM). matrix-rows-add-remove and
// timer-autosubmits map to these.

const rows = (...specs: [string, string, string][]): MatrixRow[] =>
  specs.map(([account, debit, credit], i) => ({ id: `t${i}`, account, debit, credit }));

describe("answer matrix (matrix-rows-add-remove)", () => {
  it("starts with the requested slot count, at least one", () => {
    expect(initRows(5)).toHaveLength(5);
    expect(initRows(0)).toHaveLength(1);
    expect(initRows(3).every((r) => r.account === "" && r.debit === "" && r.credit === "")).toBe(
      true,
    );
  });

  it("adds a row, up to the cap", () => {
    let r = initRows(1);
    r = addRow(r);
    expect(r).toHaveLength(2);
    // Fill to the cap and confirm no further growth.
    while (r.length < MAX_MATRIX_ROWS) r = addRow(r);
    expect(r).toHaveLength(MAX_MATRIX_ROWS);
    expect(addRow(r)).toHaveLength(MAX_MATRIX_ROWS);
  });

  it("removes the right row but never the last one", () => {
    const r = rows(["Cash", "100", ""], ["Sales", "", "100"], ["Tax", "", "18"]);
    const afterRemove = removeRow(r, 1);
    expect(afterRemove.map((x) => x.account)).toEqual(["Cash", "Tax"]);
    // Down to one → removal is a no-op.
    const one = removeRow(removeRow(afterRemove, 0), 0);
    expect(one).toHaveLength(1);
    expect(removeRow(one, 0)).toHaveLength(1);
  });

  it("sets a single cell immutably", () => {
    const r = initRows(2);
    const updated = setCell(r, 1, "account", "Cash");
    expect(updated[1]?.account).toBe("Cash");
    expect(updated[0]?.account).toBe("");
    expect(r[1]?.account).toBe(""); // original untouched
  });

  it("counts filled rows and builds submissions without blanks", () => {
    const r = rows(["Cash", "100", ""], ["", "", ""], ["Sales", "", "100"]);
    expect(filledRowCount(r)).toBe(2);
    const subs = buildSubmissions({ q1: r, q2: initRows(3) });
    expect(subs.find((s) => s.questionId === "q1")?.rows).toHaveLength(2);
    expect(subs.find((s) => s.questionId === "q2")?.rows).toHaveLength(0);
  });
});

describe("balance check", () => {
  it("parses money cells (commas, blanks, garbage)", () => {
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("  ")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
  });

  it("flags balanced vs unbalanced debits/credits", () => {
    const empty = rowBalance(initRows(2));
    expect(empty.hasInput).toBe(false);

    const balanced = rowBalance(rows(["Equipment", "50000", ""], ["Cash", "", "50000"]));
    expect(balanced).toMatchObject({ debit: 50000, credit: 50000, balanced: true, hasInput: true });

    const off = rowBalance(rows(["Equipment", "50000", ""], ["Cash", "", "40000"]));
    expect(off.balanced).toBe(false);
    expect(off.debit - off.credit).toBe(10000);
  });
});

describe("timer (timer-autosubmits)", () => {
  it("counts down and floors at zero", () => {
    const now = 1_000_000;
    expect(secondsRemaining(now + 90_000, now)).toBe(90);
    expect(secondsRemaining(now + 500, now)).toBe(0);
    expect(secondsRemaining(now - 5_000, now)).toBe(0);
  });

  it("flags expiry at/after the deadline (the auto-submit trigger)", () => {
    const now = 1_000_000;
    expect(isExpired(now + 1, now)).toBe(false);
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(now - 1, now)).toBe(true);
  });

  it("formats m:ss", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(75)).toBe("1:15");
    expect(formatCountdown(600)).toBe("10:00");
  });
});
