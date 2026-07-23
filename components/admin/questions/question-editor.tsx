"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { createQuestion, updateQuestion } from "@/actions/questions";
import type { QuestionListItem } from "@/lib/questions";
import { parseAmount } from "@/lib/answer-row-parse";
import { useToast } from "@/components/admin/toast";
import { useIsClient } from "@/lib/use-is-client";
import { lockBodyScroll } from "@/lib/scroll-lock";

// Add / edit a question (M6-S7). Prompt + options list + the accounting answer
// matrix (account / debit / credit). Wide, self-contained portal. On create the
// level is fixed; edit keeps level/exam (the update action replaces children
// wholesale — grid-edit semantics).

type Row = { account: string; debit: string; credit: string };

const inputCls =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0 sm:text-sm";

export function QuestionEditor({
  mode,
  examId,
  levels,
  question,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  examId: string;
  levels: string[];
  question?: QuestionListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mounted = useIsClient();
  const toast = useToast();
  const [pending, start] = useTransition();

  const [level, setLevel] = useState(question?.level ?? levels[0] ?? "");
  const [sourceQuestionNo, setSourceQuestionNo] = useState(question?.sourceQuestionNo ?? "");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [sheetName, setSheetName] = useState(question?.sheetName ?? "");
  const [options, setOptions] = useState<string[]>(
    question?.options.map((o) => o.optionText) ?? [""],
  );
  const [rows, setRows] = useState<Row[]>(
    question?.answerRows.map((r) => ({
      account: r.account,
      debit: r.debit ?? "",
      credit: r.credit ?? "",
    })) ?? [{ account: "", debit: "", credit: "" }],
  );
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    const unlock = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const setOption = (i: number, v: string) =>
    setOptions((prev) => prev.map((o, j) => (j === i ? v : o)));
  const setRow = (i: number, key: keyof Row, v: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  const submit = () => {
    setErr({});
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    const cleanRows = rows
      .filter((r) => r.account.trim() || r.debit.trim() || r.credit.trim())
      .map((r) => ({
        account: r.account.trim(),
        debit: parseAmount(r.debit),
        credit: parseAmount(r.credit),
      }));

    if (cleanOptions.length === 0) {
      setErr({ options: "Add at least one option" });
      return;
    }

    start(async () => {
      const body = {
        sourceQuestionNo,
        prompt,
        sheetName: sheetName.trim() || undefined,
        options: cleanOptions,
        answerRows: cleanRows,
      };
      const r =
        mode === "create"
          ? await createQuestion({ examId, level, ...body })
          : await updateQuestion({ id: question!.id, ...body });
      if (r.ok) {
        toast.success(mode === "create" ? "Question added." : "Question updated.");
        onSaved();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not save the question.");
      }
    });
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex min-h-dvh max-h-dvh w-full max-w-2xl flex-col bg-surface shadow-[0_24px_64px_-24px_rgba(2,20,20,0.6)] sm:min-h-0 sm:max-h-[88vh] sm:rounded-xl sm:border sm:border-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
            {mode === "create" ? "Add question" : `Edit question ${question?.sourceQuestionNo}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {mode === "create" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-fg-muted">Level</span>
                <div className="flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-0.5">
                  {levels.map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      aria-pressed={lv === level}
                      onClick={() => setLevel(lv)}
                      className={`min-h-10 flex-1 rounded-[7px] px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                        lv === level
                          ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                          : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {lv}
                    </button>
                  ))}
                </div>
              </label>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-fg-muted">Level</span>
                <span className="rounded-md bg-surface-2 px-3 py-2 text-sm capitalize text-fg-muted">
                  {question?.level}
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">Question no.</span>
              <input
                name="sourceQuestionNo"
                value={sourceQuestionNo}
                onChange={(e) => setSourceQuestionNo(e.target.value)}
                className={inputCls}
                placeholder="e.g. 12"
              />
              {err.sourceQuestionNo ? (
                <span className="text-xs text-[color:var(--color-danger)]">
                  {err.sourceQuestionNo}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">Sheet (optional)</span>
              <input
                name="sheetName"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                className={inputCls}
                placeholder="source sheet"
              />
            </label>
          </div>

          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Prompt</span>
            <textarea
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className={`${inputCls} resize-y`}
              placeholder="The question text students see"
            />
            {err.prompt ? (
              <span className="text-xs text-[color:var(--color-danger)]">{err.prompt}</span>
            ) : null}
          </label>

          {/* Options */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                Options
              </span>
              <button
                type="button"
                onClick={() => setOptions((p) => [...p, ""])}
                className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
              >
                + Add option
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs font-medium text-fg-subtle">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    name={`option-${i}`}
                    value={o}
                    onChange={(e) => setOption(i, e.target.value)}
                    className={inputCls}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  />
                  <button
                    type="button"
                    onClick={() => setOptions((p) => p.filter((_, j) => j !== i))}
                    disabled={options.length === 1}
                    aria-label="Remove option"
                    className="grid size-11 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] disabled:opacity-40"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
            {err.options ? (
              <span className="mt-1 block text-xs text-[color:var(--color-danger)]">
                {err.options}
              </span>
            ) : null}
          </div>

          {/* Answer rows */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                Answer rows (account · debit · credit)
              </span>
              <button
                type="button"
                onClick={() => setRows((p) => [...p, { account: "", debit: "", credit: "" }])}
                className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
              >
                + Add row
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_110px_110px_auto]"
                >
                  <input
                    name={`answerRow-${i}-account`}
                    value={r.account}
                    onChange={(e) => setRow(i, "account", e.target.value)}
                    className={`${inputCls} col-span-2 sm:col-span-1`}
                    placeholder="Account"
                  />
                  <input
                    name={`answerRow-${i}-debit`}
                    value={r.debit}
                    onChange={(e) => setRow(i, "debit", e.target.value)}
                    className={`${inputCls} text-right`}
                    placeholder="Debit"
                    inputMode="decimal"
                  />
                  <input
                    name={`answerRow-${i}-credit`}
                    value={r.credit}
                    onChange={(e) => setRow(i, "credit", e.target.value)}
                    className={`${inputCls} text-right`}
                    placeholder="Credit"
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                    aria-label="Remove row"
                    className="row-span-2 grid size-11 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] sm:row-span-1"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-fg-subtle">
              Leave a debit or credit blank for an empty cell. Commas are ignored.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse items-stretch justify-end gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : mode === "create" ? "Add question" : "Save changes"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
