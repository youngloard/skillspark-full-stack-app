"use client";

import Link from "next/link";
import { useState } from "react";
import type { QuestionResult } from "@/lib/evaluator";
import { Chevron, LedgerTable, levelLabel, Navigator } from "./quiz-parts";

// The answer review (M5-S7, shared with the M5-S6 post-submit screen): a score
// header, a Correct/Incorrect/Not-attended navigator, and per-question "your
// answer vs correct answer" — navigable one at a time. Self-contained from the
// stored evaluation, so it renders a live submission and a past attempt alike.

export type AttemptReviewData = {
  level: string;
  score: number;
  totalQuestions: number;
  percentage: number; // 0–1
  performanceLabel: string;
  questionResults: QuestionResult[];
};

export function AttemptReview({
  review,
  backHref,
  backLabel = "Done",
}: {
  review: AttemptReviewData;
  backHref: string;
  backLabel?: string;
}) {
  const results = review.questionResults;
  const total = results.length;
  const [current, setCurrent] = useState(0);
  const goTo = (i: number) => {
    setCurrent(Math.min(total - 1, Math.max(0, i)));
    window.scrollTo({ top: 0 });
  };

  const r = results[current];
  const pct = Math.round(review.percentage * 100);
  const unattended = !r || r.studentRows.length === 0;

  return (
    <div className="pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            {levelLabel(review.level)} · results
          </p>
          <p className="tabular mt-1 font-display text-3xl font-semibold text-fg">
            {pct}%
            <span className="ml-2 text-base font-medium text-fg-muted">
              {review.score} / {review.totalQuestions} correct
            </span>
          </p>
        </div>
        <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
          {review.performanceLabel}
        </span>
      </div>

      <Navigator
        total={total}
        current={current}
        onGo={goTo}
        state={(i) => {
          const qr = results[i];
          if (!qr || qr.studentRows.length === 0) return "unattended";
          return qr.isCorrect ? "correct" : "wrong";
        }}
        legend={[
          { label: "Correct", state: "correct" },
          { label: "Incorrect", state: "wrong" },
          { label: "Not attended", state: "unattended" },
        ]}
      />

      {r ? (
        <div className="mt-6">
          <div className="flex items-baseline gap-3">
            <span className="tabular shrink-0 text-sm font-semibold text-accent">
              {String(current + 1).padStart(2, "0")}
              <span className="text-fg-subtle"> / {total}</span>
            </span>
            <p className="text-[15px] leading-relaxed text-fg">{r.prompt}</p>
          </div>
          <span
            className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
              unattended
                ? "bg-surface-2 text-fg-muted"
                : r.isCorrect
                  ? "bg-accent/10 text-accent"
                  : "bg-danger/10 text-danger"
            }`}
          >
            {unattended ? "Not attended" : r.isCorrect ? "Correct" : "Incorrect"}
          </span>

          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Your answer
              </h3>
              {r.studentRows.length > 0 ? (
                <LedgerTable
                  rows={r.studentRows.map((row) => ({
                    account: row.account,
                    debit: row.debit,
                    credit: row.credit,
                    accountOk: row.accountMatched,
                    debitOk: row.debitMatched,
                    creditOk: row.creditMatched,
                  }))}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
                  No answer given.
                </p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Correct answer
              </h3>
              <LedgerTable
                rows={r.correctRows.map((row) => ({
                  account: row.account,
                  debit: row.debit,
                  credit: row.credit,
                }))}
              />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-30"
            >
              <Chevron className="h-4 w-4 rotate-90" />
              Previous
            </button>
            {current < total - 1 ? (
              <button
                type="button"
                onClick={() => goTo(current + 1)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
              >
                Next
                <Chevron className="h-4 w-4 -rotate-90" />
              </button>
            ) : (
              <Link
                href={backHref}
                className="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
              >
                {backLabel}
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
