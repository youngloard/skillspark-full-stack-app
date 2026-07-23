import { describe, expect, it } from "vitest";
import { evaluateSubmissions, getPerformanceLabel, type StudentSubmission } from "./evaluator";

// Parity fixtures ported from _reference/Jet_Exam/tests/unit/evaluator.test.ts
// — every case and expectation carried over, so the port provably scores the
// same way the live JET app does. label-thresholds pins A-4 (DECISIONS).

function makeQuestion(
  id: string,
  answerRows: Array<{ account: string; debit: number | null; credit: number | null }>,
) {
  return {
    id,
    sourceQuestionNo: id,
    prompt: `Test question ${id}`,
    answerRows: answerRows.map((row, i) => ({ id: `${id}-row-${i}`, ...row })),
  };
}

describe("evaluateSubmissions (reference parity)", () => {
  it("scores a perfect submission correctly", () => {
    const questions = [
      makeQuestion("q1", [
        { account: "Cash", debit: 500, credit: null },
        { account: "Revenue", debit: null, credit: 500 },
      ]),
    ];
    const submissions: StudentSubmission[] = [
      {
        questionId: "q1",
        rows: [
          { account: "Cash", debit: "500", credit: "" },
          { account: "Revenue", debit: "", credit: "500" },
        ],
      },
    ];
    const result = evaluateSubmissions("basic", questions, submissions);
    expect(result.correctQuestions).toBe(1);
    expect(result.accuracy).toBe(1);
    expect(result.lineAccuracy).toBe(1);
    expect(result.questionResults[0]!.isCorrect).toBe(true);
  });

  it("handles completely wrong answers", () => {
    const questions = [makeQuestion("q1", [{ account: "Cash", debit: 500, credit: null }])];
    const submissions: StudentSubmission[] = [
      { questionId: "q1", rows: [{ account: "Inventory", debit: "300", credit: "" }] },
    ];
    const result = evaluateSubmissions("basic", questions, submissions);
    expect(result.correctQuestions).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.questionResults[0]!.isCorrect).toBe(false);
  });

  it("handles empty submissions", () => {
    const questions = [makeQuestion("q1", [{ account: "Cash", debit: 100, credit: null }])];
    const result = evaluateSubmissions("basic", questions, []);
    expect(result.correctQuestions).toBe(0);
    expect(result.wrongQuestions).toBe(1);
    expect(result.questionResults[0]!.missingRows.length).toBe(1);
  });

  it("handles multiple questions with mixed results", () => {
    const questions = [
      makeQuestion("q1", [{ account: "Cash", debit: 100, credit: null }]),
      makeQuestion("q2", [{ account: "Revenue", debit: null, credit: 200 }]),
    ];
    const submissions: StudentSubmission[] = [
      { questionId: "q1", rows: [{ account: "Cash", debit: "100", credit: "" }] },
      { questionId: "q2", rows: [{ account: "Expense", debit: "200", credit: "" }] },
    ];
    const result = evaluateSubmissions("medium", questions, submissions);
    expect(result.correctQuestions).toBe(1);
    expect(result.wrongQuestions).toBe(1);
    expect(result.accuracy).toBe(0.5);
  });

  it("is case-insensitive on account matching", () => {
    const questions = [makeQuestion("q1", [{ account: "Cash", debit: 500, credit: null }])];
    const submissions: StudentSubmission[] = [
      { questionId: "q1", rows: [{ account: "  CASH  ", debit: "500", credit: "" }] },
    ];
    const result = evaluateSubmissions("basic", questions, submissions);
    expect(result.correctQuestions).toBe(1);
  });

  it("handles comma-formatted numbers", () => {
    const questions = [makeQuestion("q1", [{ account: "Cash", debit: 1500, credit: null }])];
    const submissions: StudentSubmission[] = [
      { questionId: "q1", rows: [{ account: "Cash", debit: "1,500", credit: "" }] },
    ];
    const result = evaluateSubmissions("hard", questions, submissions);
    expect(result.correctQuestions).toBe(1);
  });

  it("handles zero questions gracefully", () => {
    const result = evaluateSubmissions("basic", [], []);
    expect(result.totalQuestions).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.lineAccuracy).toBe(0);
  });

  it("handles partial row matches and tracks line accuracy", () => {
    const questions = [
      makeQuestion("q1", [
        { account: "Cash", debit: 100, credit: null },
        { account: "Revenue", debit: null, credit: 100 },
        { account: "Tax", debit: 20, credit: null },
      ]),
    ];
    const submissions: StudentSubmission[] = [
      {
        questionId: "q1",
        rows: [
          { account: "Cash", debit: "100", credit: "" },
          { account: "Revenue", debit: "", credit: "100" },
          { account: "Wrong", debit: "0", credit: "" },
        ],
      },
    ];
    const result = evaluateSubmissions("basic", questions, submissions);
    expect(result.lineAccuracy).toBeCloseTo(2 / 3, 2);
    expect(result.questionResults[0]!.matchedRows).toBe(2);
  });

  it("3/1/1 best-partial claims the right reference row", () => {
    // A wrong-amount row must claim the row whose ACCOUNT matches (weight 3),
    // not one where only amounts match (weight 2).
    const questions = [
      makeQuestion("q1", [
        { account: "Cash", debit: 100, credit: null },
        { account: "Bank", debit: 999, credit: null },
      ]),
    ];
    const submissions: StudentSubmission[] = [
      { questionId: "q1", rows: [{ account: "Bank", debit: "100", credit: "" }] },
    ];
    const result = evaluateSubmissions("basic", questions, submissions);
    const studentRow = result.questionResults[0]!.studentRows[0]!;
    expect(studentRow.referenceRowId).toBe("q1-row-1"); // the Bank row
    expect(studentRow.accountMatched).toBe(true);
    expect(studentRow.debitMatched).toBe(false);
  });
});

describe("label-thresholds (A-4, reference parity)", () => {
  it("maps fractions to labels at the reference boundaries", () => {
    expect(getPerformanceLabel(0, 0)).toBe("Poor"); // zero-question guard
    expect(getPerformanceLabel(0, 10)).toBe("Poor");
    expect(getPerformanceLabel(3, 10)).toBe("Poor"); // 30% < 40
    expect(getPerformanceLabel(4, 10)).toBe("Good"); // 40% boundary
    expect(getPerformanceLabel(6, 10)).toBe("Good"); // 60%
    expect(getPerformanceLabel(7, 10)).toBe("Very Good"); // 70% boundary
    expect(getPerformanceLabel(8, 10)).toBe("Very Good"); // 80%
    expect(getPerformanceLabel(9, 10)).toBe("Excellent"); // 90% boundary
    expect(getPerformanceLabel(10, 10)).toBe("Excellent");
  });
});
