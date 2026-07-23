"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { submitQuizAction } from "@/actions/quiz";
import type { StudentQuizQuestion } from "@/lib/quiz";
import {
  addRow,
  buildSubmissions,
  filledRowCount,
  formatCountdown,
  initRows,
  isExpired,
  removeRow,
  rowBalance,
  secondsRemaining,
  setCell,
  type MatrixRow,
} from "@/lib/quiz-runtime";
import { AccountSelect } from "./account-select";
import { AttemptReview, type AttemptReviewData } from "./attempt-review";
import { Chevron, levelLabel, Navigator } from "./quiz-parts";

// Quiz-taking screen (M5-S6). One question at a time with a number navigator
// (answered / not attended) to jump around; a server-authority timer that
// auto-submits at zero. On submit it hands off to the shared AttemptReview.
// Answers are only posted, never received while taking.

export function QuizRunner({
  examId,
  quizId,
  level,
  questions,
  expiresAt,
}: {
  examId: string;
  quizId: string;
  level: string;
  questions: StudentQuizQuestion[];
  expiresAt: string;
}) {
  const expiresAtMs = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);

  const [matrices, setMatrices] = useState<Record<string, MatrixRow[]>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, initRows(q.answerSlotCount)])),
  );
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(() => secondsRemaining(expiresAtMs, Date.now()));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<AttemptReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submittedRef = useRef(false);
  const matricesRef = useRef(matrices);
  useEffect(() => {
    matricesRef.current = matrices;
  }, [matrices]);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    const res = await submitQuizAction({
      quizId,
      submissions: buildSubmissions(matricesRef.current),
    });
    if (res.ok) {
      const a = res.data.attempt;
      setReview({
        level,
        score: a.score,
        totalQuestions: a.totalQuestions,
        percentage: a.percentage,
        performanceLabel: a.performanceLabel,
        questionResults: a.results.questionResults ?? [],
      });
      window.scrollTo({ top: 0 });
    } else {
      setError(res.error.message);
      submittedRef.current = false;
    }
    setSubmitting(false);
  }, [quizId, level]);

  useEffect(() => {
    if (review) return; // stop the clock once submitted
    const tick = () => {
      setRemaining(secondsRemaining(expiresAtMs, Date.now()));
      if (isExpired(expiresAtMs, Date.now())) void submit();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAtMs, submit, review]);

  const total = questions.length;
  const goTo = (i: number) => {
    setCurrent(Math.min(total - 1, Math.max(0, i)));
    window.scrollTo({ top: 0 });
  };

  if (review) {
    return <AttemptReview review={review} backHref={`/exams/${examId}`} />;
  }

  const q = questions[current]!;
  const rows = matrices[q.id] ?? [];
  const balance = rowBalance(rows);
  const danger = remaining <= 60;
  const answered = questions.filter((qq) => filledRowCount(matrices[qq.id] ?? []) > 0).length;

  return (
    <div className="pb-16">
      <div className="sticky top-[6.25rem] z-30 -mx-5 border-b border-line bg-bg/85 px-5 py-3 backdrop-blur-md sm:top-16 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              {levelLabel(level)} · {answered}/{total} answered
            </p>
            <p
              className={`tabular text-xl font-semibold tracking-tight ${danger ? "text-danger" : "text-fg"}`}
              aria-live="polite"
            >
              {formatCountdown(remaining)}
            </p>
          </div>
          {confirming ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Confirm submit"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={submitting}
              className="min-h-11 shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              Submit
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-danger/25 bg-danger/8 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <Navigator
        total={total}
        current={current}
        onGo={goTo}
        state={(i) => (filledRowCount(matrices[questions[i]!.id] ?? []) > 0 ? "answered" : "empty")}
        legend={[
          { label: "Answered", state: "answered" },
          { label: "Not attended", state: "empty" },
        ]}
      />

      <div className="mt-6">
        <div className="flex items-baseline gap-3">
          <span className="tabular shrink-0 text-sm font-semibold text-accent">
            {String(current + 1).padStart(2, "0")}
            <span className="text-fg-subtle"> / {total}</span>
          </span>
          <p className="text-[15px] leading-relaxed text-fg">{q.prompt}</p>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle sm:grid">
            <span>Account</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
            <span className="w-9" />
          </div>

          <div className="space-y-3 sm:space-y-2">
            {rows.map((row, ri) => (
              <div
                key={row.id}
                className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
              >
                <AccountSelect
                  value={row.account}
                  options={q.options}
                  onChange={(v) =>
                    setMatrices((m) => ({ ...m, [q.id]: setCell(m[q.id] ?? [], ri, "account", v) }))
                  }
                  ariaLabel={`Question ${current + 1} row ${ri + 1} account`}
                />
                <div className="grid grid-cols-2 gap-2 sm:contents">
                  <input
                    name={`question-${q.id}-row-${row.id}-debit`}
                    value={row.debit}
                    onChange={(e) =>
                      setMatrices((m) => ({
                        ...m,
                        [q.id]: setCell(m[q.id] ?? [], ri, "debit", e.target.value),
                      }))
                    }
                    inputMode="decimal"
                    placeholder="Debit"
                    aria-label={`Question ${current + 1} row ${ri + 1} debit`}
                    className="tabular min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-right text-base text-fg focus-visible:border-accent sm:min-h-0 sm:py-2 sm:text-sm"
                  />
                  <input
                    name={`question-${q.id}-row-${row.id}-credit`}
                    value={row.credit}
                    onChange={(e) =>
                      setMatrices((m) => ({
                        ...m,
                        [q.id]: setCell(m[q.id] ?? [], ri, "credit", e.target.value),
                      }))
                    }
                    inputMode="decimal"
                    placeholder="Credit"
                    aria-label={`Question ${current + 1} row ${ri + 1} credit`}
                    className="tabular min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-right text-base text-fg focus-visible:border-accent sm:min-h-0 sm:py-2 sm:text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setMatrices((m) => ({ ...m, [q.id]: removeRow(m[q.id] ?? [], ri) }))
                  }
                  disabled={rows.length <= 1}
                  aria-label={`Delete row ${ri + 1}`}
                  title="Delete row"
                  className="grid h-11 w-11 shrink-0 place-items-center justify-self-end rounded-md border border-line text-fg-subtle transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-30 sm:h-9 sm:w-9 sm:justify-self-auto sm:border-0"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMatrices((m) => ({ ...m, [q.id]: addRow(m[q.id] ?? []) }))}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Add row
            </button>
            {balance.hasInput ? (
              balance.balanced ? (
                <p className="text-[13px] font-medium text-accent">Balanced</p>
              ) : (
                <p className="tabular text-[13px] font-medium text-warning">
                  Not balanced · Dr {balance.debit.toLocaleString()} vs Cr{" "}
                  {balance.credit.toLocaleString()}
                </p>
              )
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-30"
          >
            <Chevron className="h-4 w-4 rotate-90" />
            Previous
          </button>
          {current < total - 1 ? (
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"
            >
              Next
              <Chevron className="h-4 w-4 -rotate-90" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"
            >
              Review &amp; submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
