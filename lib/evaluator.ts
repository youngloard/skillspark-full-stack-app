// JET quiz evaluator — BEHAVIOR-IDENTICAL port of
// _reference/Jet_Exam/src/server/services/evaluator.ts (hard project rule)
// plus getPerformanceLabel from its platform store (A-4 resolved: <40% Poor,
// <70% Good, <90% Very Good, ≥90% Excellent; 0 questions → Poor).
// Pure module: no server imports, unit-testable, parity fixtures ported from
// the reference's own test suite.

export type EvalAnswerRow = {
  id: string;
  account: string;
  debit: number | null;
  credit: number | null;
};

export type StudentAnswerRow = {
  account: string;
  debit: string;
  credit: string;
};

export type StudentSubmission = {
  questionId: string;
  rows: StudentAnswerRow[];
};

export type EvalQuestion = {
  id: string;
  sourceQuestionNo: string;
  prompt: string;
  answerRows: EvalAnswerRow[];
};

export type EvaluatedStudentRow = EvalAnswerRow & {
  matched: boolean;
  referenceRowId: string | null;
  accountMatched: boolean;
  debitMatched: boolean;
  creditMatched: boolean;
};

export type QuestionResult = {
  questionId: string;
  sourceQuestionNo: string;
  prompt: string;
  isCorrect: boolean;
  matchedRows: number;
  expectedRows: number;
  studentRows: EvaluatedStudentRow[];
  missingRows: EvalAnswerRow[];
  correctRows: EvalAnswerRow[];
};

export type EvaluationResponse = {
  level: string;
  totalQuestions: number;
  correctQuestions: number;
  wrongQuestions: number;
  accuracy: number;
  lineAccuracy: number;
  questionResults: QuestionResult[];
};

export type PerformanceLabel = "Poor" | "Good" | "Very Good" | "Excellent";

function normalizeAccount(account: string): string {
  return account.trim().toLowerCase();
}

function parseAnswerAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToken(row: Pick<EvalAnswerRow, "account" | "debit" | "credit">): string {
  return JSON.stringify({
    account: normalizeAccount(row.account),
    debit: row.debit,
    credit: row.credit,
  });
}

function normalizeStudentRows(rows: StudentAnswerRow[]): EvalAnswerRow[] {
  return rows
    .map((row, index) => ({
      id: `student-${index}`,
      account: row.account.trim(),
      debit: parseAnswerAmount(row.debit),
      credit: parseAnswerAmount(row.credit),
    }))
    .filter((row) => row.account || row.debit !== null || row.credit !== null);
}

function getFieldMatchState(studentRow: EvalAnswerRow, correctRow: EvalAnswerRow) {
  return {
    accountMatched: normalizeAccount(studentRow.account) === normalizeAccount(correctRow.account),
    debitMatched: studentRow.debit === correctRow.debit,
    creditMatched: studentRow.credit === correctRow.credit,
  };
}

/** Account carries weight 3; each amount 1 — the reference's 3/1/1 rule. */
function getFieldMatchScore(studentRow: EvalAnswerRow, correctRow: EvalAnswerRow): number {
  const fields = getFieldMatchState(studentRow, correctRow);
  return (
    Number(fields.accountMatched) * 3 + Number(fields.debitMatched) + Number(fields.creditMatched)
  );
}

export function evaluateSubmissions(
  level: string,
  questions: EvalQuestion[],
  submissions: StudentSubmission[],
): EvaluationResponse {
  const submissionsById = new Map(
    submissions.map((submission) => [submission.questionId, submission]),
  );

  const questionResults = questions.map((question) => {
    const submission = submissionsById.get(question.id);
    const studentRows = normalizeStudentRows(submission?.rows ?? []);
    const correctRows = question.answerRows;
    const availableRows = correctRows.map((row) => ({ row, claimed: false }));

    const evaluatedStudentRows = studentRows.map((row) => {
      const exactMatch = availableRows.find(
        (candidate) => !candidate.claimed && rowToken(candidate.row) === rowToken(row),
      );

      if (exactMatch) {
        exactMatch.claimed = true;
        return {
          ...row,
          matched: true,
          referenceRowId: exactMatch.row.id,
          accountMatched: true,
          debitMatched: true,
          creditMatched: true,
        };
      }

      let bestMatch: (typeof availableRows)[number] | null = null;
      let bestScore = 0;

      for (const candidate of availableRows) {
        if (candidate.claimed) {
          continue;
        }
        const score = getFieldMatchScore(row, candidate.row);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      if (bestMatch) {
        bestMatch.claimed = true;
        const fields = getFieldMatchState(row, bestMatch.row);
        return {
          ...row,
          matched: false,
          referenceRowId: bestMatch.row.id,
          ...fields,
        };
      }

      return {
        ...row,
        matched: false,
        referenceRowId: null,
        accountMatched: false,
        debitMatched: false,
        creditMatched: false,
      };
    });

    const exactMatchedIds = new Set(
      evaluatedStudentRows
        .filter((row) => row.matched && row.referenceRowId)
        .map((row) => row.referenceRowId as string),
    );

    const missingRows = correctRows.filter((row) => !exactMatchedIds.has(row.id));
    const isCorrect = missingRows.length === 0 && evaluatedStudentRows.every((row) => row.matched);
    const matchedRows = evaluatedStudentRows.filter((row) => row.matched).length;

    return {
      questionId: question.id,
      sourceQuestionNo: question.sourceQuestionNo,
      prompt: question.prompt,
      isCorrect,
      matchedRows,
      expectedRows: correctRows.length,
      studentRows: evaluatedStudentRows,
      missingRows,
      correctRows,
    };
  });

  const correctQuestions = questionResults.filter((result) => result.isCorrect).length;
  const totalExpectedRows = questionResults.reduce((sum, result) => sum + result.expectedRows, 0);
  const totalMatchedRows = questionResults.reduce((sum, result) => sum + result.matchedRows, 0);

  return {
    level,
    totalQuestions: questions.length,
    correctQuestions,
    wrongQuestions: questions.length - correctQuestions,
    accuracy: questions.length === 0 ? 0 : correctQuestions / questions.length,
    lineAccuracy: totalExpectedRows === 0 ? 0 : totalMatchedRows / totalExpectedRows,
    questionResults,
  };
}

/** Reference thresholds (A-4): fractions of questions correct. */
export function getPerformanceLabel(score: number, totalQuestions: number): PerformanceLabel {
  if (totalQuestions === 0) return "Poor";
  const percentage = score / totalQuestions;
  if (percentage < 0.4) return "Poor";
  if (percentage < 0.7) return "Good";
  if (percentage < 0.9) return "Very Good";
  return "Excellent";
}
