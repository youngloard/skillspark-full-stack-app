"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  importQuestionChunk,
  previewQuestionWorkbook,
  type QuestionWorkbookPreview,
} from "@/actions/question-import";
import { useToast } from "@/components/admin/toast";
import { useIsClient } from "@/lib/use-is-client";
import { lockBodyScroll } from "@/lib/scroll-lock";

const CHUNK = 50;
const WORKBOOK_LEVELS = ["basic", "medium", "hard"] as const;

type ImportMode = "full" | "single";
type Stage = "pick" | "reading" | "preview" | "running" | "done";
type Tally = { created: number; skipped: number; failed: number };
type PreviewQuestion = QuestionWorkbookPreview["questions"][number];

export function QuestionImportDialog({
  examId,
  levels,
  onClose,
  onImported,
}: {
  examId: string;
  levels: string[];
  onClose: () => void;
  onImported: () => void;
}) {
  const mounted = useIsClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [mode, setMode] = useState<ImportMode>("full");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewQuestion[]>([]);
  const [targetLevel, setTargetLevel] = useState(levels[0] ?? "basic");
  const [done, setDone] = useState(0);
  const [tally, setTally] = useState<Tally>({ created: 0, skipped: 0, failed: 0 });
  const [errors, setErrors] = useState<{ no: string; level: string; message: string }[]>([]);
  const changedRef = useRef(false);

  const close = () => {
    if (changedRef.current) onImported();
    onClose();
  };

  useEffect(() => {
    const unlock = lockBodyScroll();
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && stage !== "running" && stage !== "reading" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const onPick = async (file: File) => {
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    const isCsv = file.name.toLowerCase().endsWith(".csv");

    if (mode === "full" && !isXlsx) {
      toast.error("Full workbook mode requires an Excel (.xlsx) file.");
      return;
    }
    if (!isXlsx && !(mode === "single" && isCsv)) {
      toast.error("Choose an Excel (.xlsx) file, or a CSV in Single level mode.");
      return;
    }

    setStage("reading");
    try {
      if (
        mode === "single" &&
        !WORKBOOK_LEVELS.includes(targetLevel as (typeof WORKBOOK_LEVELS)[number])
      ) {
        toast.error("Question files support Basic, Medium, or Hard levels.");
        setStage("pick");
        return;
      }

      const data = new FormData();
      data.set("examId", examId);
      data.set("file", file);
      data.set("mode", mode);
      if (mode === "single") data.set("targetLevel", targetLevel);
      const result = await previewQuestionWorkbook(data);
      if (!result.ok) {
        toast.error(result.error.message || "Could not read that question file.");
        setStage("pick");
        return;
      }
      const parsed = result.data.questions;

      if (parsed.length === 0) {
        toast.error("No questions found in that file.");
        setStage("pick");
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setStage("preview");
    } catch {
      toast.error("Could not read that file.");
      setStage("pick");
    }
  };

  const valid = rows.filter((row) => !row.error && !row.duplicate);
  const invalid = rows.filter((row) => row.error).length;
  const duplicates = rows.filter((row) => row.duplicate).length;
  const counts = valid.reduce<Record<string, number>>((result, row) => {
    result[row.level] = (result[row.level] ?? 0) + 1;
    return result;
  }, {});
  const summaryLevels = mode === "full" ? [...WORKBOOK_LEVELS] : [targetLevel];

  const run = async () => {
    setStage("running");
    setDone(0);
    setTally({ created: 0, skipped: duplicates, failed: 0 });
    setErrors([]);

    const grouped = new Map<string, PreviewQuestion[]>();
    for (const question of valid) {
      const group = grouped.get(question.level) ?? [];
      group.push(question);
      grouped.set(question.level, group);
    }

    let processed = 0;
    for (const [questionLevel, questions] of grouped) {
      for (let i = 0; i < questions.length; i += CHUNK) {
        const chunk = questions.slice(i, i + CHUNK);
        const result = await importQuestionChunk({
          examId,
          level: questionLevel,
          questions: chunk,
        });
        if (result.ok) {
          const next: Tally = { created: 0, skipped: 0, failed: 0 };
          const nextErrors: { no: string; level: string; message: string }[] = [];
          for (const outcome of result.data.outcomes) {
            if (outcome.status === "created") next.created++;
            else if (outcome.status === "duplicate") next.skipped++;
            else {
              next.failed++;
              nextErrors.push({
                no: outcome.sourceQuestionNo,
                level: questionLevel,
                message: outcome.message ?? "Failed",
              });
            }
          }
          if (next.created > 0) changedRef.current = true;
          setTally((previous) => ({
            created: previous.created + next.created,
            skipped: previous.skipped + next.skipped,
            failed: previous.failed + next.failed,
          }));
          if (nextErrors.length) setErrors((previous) => [...previous, ...nextErrors]);
        } else {
          setTally((previous) => ({ ...previous, failed: previous.failed + chunk.length }));
          setErrors((previous) => [
            ...previous,
            ...chunk.map((question) => ({
              no: question.sourceQuestionNo,
              level: questionLevel,
              message: result.error.message || "Chunk failed",
            })),
          ]);
        }
        processed += chunk.length;
        setDone(processed);
      }
    }
    setStage("done");
  };

  if (!mounted) return null;
  const pct = valid.length ? Math.round((done / valid.length) * 100) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-import-title"
      onMouseDown={(event) =>
        event.target === event.currentTarget &&
        stage !== "running" &&
        stage !== "reading" &&
        close()
      }
    >
      <div className="flex min-h-dvh max-h-dvh w-full max-w-3xl flex-col bg-surface shadow-[0_24px_64px_-24px_rgba(2,20,20,0.6)] sm:min-h-0 sm:max-h-[86vh] sm:rounded-xl sm:border sm:border-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <h2
              id="question-import-title"
              className="font-display text-lg font-semibold tracking-tight text-fg"
            >
              Import questions
            </h2>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Preview the file first, then import valid questions into this exam.
            </p>
          </div>
          {stage !== "running" && stage !== "reading" ? (
            <button
              type="button"
              onClick={close}
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
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {stage === "pick" ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-fg-muted">
                    Import mode
                  </span>
                  <DesignedDropdown
                    ariaLabel="Import mode"
                    value={mode}
                    options={[
                      { value: "full", label: "Full workbook" },
                      { value: "single", label: "Single level file" },
                    ]}
                    onChange={(value) => setMode(value as ImportMode)}
                  />
                </div>
                {mode === "single" ? (
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-fg-muted">
                      Import into level
                    </span>
                    <DesignedDropdown
                      ariaLabel="Import into level"
                      value={targetLevel}
                      options={levels.map((level) => ({
                        value: level,
                        label: level.charAt(0).toUpperCase() + level.slice(1),
                      }))}
                      onChange={setTargetLevel}
                    />
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center transition-colors hover:border-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg-muted">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 16V4m0 0L8 8m4-4 4 4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium text-fg">
                  Choose {mode === "full" ? "an Excel workbook" : "a question file"} to{" "}
                  <span className="text-accent">browse</span>
                </span>
                <span className="max-w-lg text-xs leading-5 text-fg-subtle">
                  {mode === "full"
                    ? "One .xlsx file with Basic, Medium, and Hard sheets, level markers, or three blocks separated by blank rows."
                    : "One .xlsx or .csv file containing a single level. The selected level is applied to every question."}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  name="questionImportFile"
                  accept={
                    mode === "full"
                      ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      : ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  }
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void onPick(file);
                  }}
                />
              </button>
            </div>
          ) : stage === "reading" ? (
            <div className="grid min-h-56 place-items-center text-center" role="status">
              <div>
                <span className="mx-auto block size-7 animate-spin rounded-full border-2 border-line border-t-accent" />
                <p className="mt-4 text-sm font-medium text-fg">Reading and validating the file…</p>
                <p className="mt-1 text-xs text-fg-subtle">
                  No questions are written during preview.
                </p>
              </div>
            </div>
          ) : stage === "preview" ? (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-fg">{fileName}</span>
                <span className="text-fg-muted">
                  {valid.length} ready
                  {duplicates > 0 ? (
                    <span className="text-fg-subtle"> · {duplicates} duplicates skipped</span>
                  ) : null}
                  {invalid > 0 ? (
                    <span className="text-[color:var(--color-danger)]">
                      {" "}
                      · {invalid} invalid skipped
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {summaryLevels.map((level) => (
                  <div key={level} className="rounded-lg bg-surface-2/60 px-3 py-2.5">
                    <div className="font-display text-xl font-semibold tabular-nums text-fg">
                      {counts[level] ?? 0}
                    </div>
                    <div className="mt-0.5 text-xs capitalize text-fg-subtle">{level}</div>
                  </div>
                ))}
              </div>

              <div className="sm:hidden">
                {rows.slice(0, 100).map((question, index) => (
                  <details
                    key={`${question.level}-${question.sourceQuestionNo}-${index}`}
                    className="group border-b border-hairline"
                  >
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-xs text-fg-muted">
                          <span className="font-mono">No. {question.sourceQuestionNo || "—"}</span>
                          <span className="capitalize">{question.level}</span>
                          <span
                            className={
                              question.error
                                ? "text-[color:var(--color-danger)]"
                                : question.duplicate
                                  ? "text-fg-subtle"
                                  : "text-[color:var(--color-success)]"
                            }
                          >
                            {question.error
                              ? "Invalid"
                              : question.duplicate
                                ? "Duplicate"
                                : "Ready"}
                          </span>
                        </span>
                        <span className="mt-1 block line-clamp-2 text-sm text-fg">
                          {question.prompt || "—"}
                        </span>
                      </span>
                      <svg
                        className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="m7 10 5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </summary>
                    <div className="grid grid-cols-2 gap-2 pb-3 text-xs text-fg-muted">
                      <span>
                        Options:{" "}
                        <strong className="font-medium text-fg">{question.options.length}</strong>
                      </span>
                      <span>
                        Answer rows:{" "}
                        <strong className="font-medium text-fg">
                          {question.answerRows.length}
                        </strong>
                      </span>
                      {question.error ? (
                        <p className="col-span-2 text-[color:var(--color-danger)]">
                          {question.error}
                        </p>
                      ) : null}
                      {question.duplicate ? (
                        <p className="col-span-2 text-fg-subtle">Duplicate · skipped</p>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">No.</th>
                      <th className="px-3 py-2 font-medium">Level</th>
                      <th className="px-3 py-2 font-medium">Prompt</th>
                      <th className="px-3 py-2 text-right font-medium">Opts</th>
                      <th className="px-3 py-2 text-right font-medium">Rows</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((question, index) => (
                      <tr
                        key={`${question.level}-${question.sourceQuestionNo}-${index}`}
                        className={`border-t border-line ${
                          question.error
                            ? "bg-[color:var(--color-danger)]/5"
                            : question.duplicate
                              ? "bg-surface-2/40"
                              : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-fg-muted">
                          {question.sourceQuestionNo || "—"}
                        </td>
                        <td className="px-3 py-2 capitalize text-fg-muted">{question.level}</td>
                        <td className="max-w-md px-3 py-2 text-fg">
                          <span className="line-clamp-1">{question.prompt || "—"}</span>
                          {question.error ? (
                            <span className="block text-xs text-[color:var(--color-danger)]">
                              {question.error}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                          {question.options.length}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                          {question.answerRows.length}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {question.error ? (
                            <span className="text-[color:var(--color-danger)]">Invalid</span>
                          ) : question.duplicate ? (
                            <span className="text-fg-subtle">Duplicate · skipped</span>
                          ) : (
                            <span className="text-[color:var(--color-success)]">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 100 ? (
                <p className="mt-2 text-xs text-fg-subtle">
                  Showing the first 100 of {rows.length} questions. Only new, valid questions will
                  be imported.
                </p>
              ) : null}
            </div>
          ) : (
            <div aria-live="polite">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-fg">
                  {stage === "done" ? "Import complete" : "Importing…"}
                </span>
                <span className="text-fg-muted">
                  {done} / {valid.length}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="Created" value={tally.created} tone="good" />
                <Stat label="Duplicates skipped" value={tally.skipped} tone="muted" />
                <Stat label="Failed" value={tally.failed} tone="bad" />
              </div>
              {errors.length > 0 ? (
                <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-line">
                  <ul className="divide-y divide-line text-sm">
                    {errors.map((error, index) => (
                      <li
                        key={index}
                        className="flex items-baseline justify-between gap-3 px-3 py-2"
                      >
                        <span className="text-fg">
                          <span className="capitalize text-fg-muted">{error.level}</span> · Q
                          {error.no || "—"}
                        </span>
                        <span className="shrink-0 text-xs text-[color:var(--color-danger)]">
                          {error.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse items-stretch justify-end gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4 [&>button]:w-full sm:[&>button]:w-auto">
          {stage === "preview" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setStage("pick");
                }}
                className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Choose another file
              </button>
              <button
                type="button"
                onClick={run}
                disabled={valid.length === 0}
                className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                Import {valid.length} question{valid.length === 1 ? "" : "s"}
              </button>
            </>
          ) : stage === "running" || stage === "reading" ? (
            <span className="text-sm text-fg-muted">
              {stage === "running" ? "Importing… keep this open." : "Reading file…"}
            </span>
          ) : stage === "done" ? (
            <button
              type="button"
              onClick={close}
              className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

type DesignedOption = { value: string; label: string };

function DesignedDropdown({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: DesignedOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDocumentDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentDown);
    return () => document.removeEventListener("mousedown", onDocumentDown);
  }, [open]);

  const choose = (option: DesignedOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setActive(
          Math.max(
            0,
            options.findIndex((option) => option.value === value),
          ),
        );
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setActive(
            Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
          );
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-accent/40 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:py-2"
      >
        <span className="truncate text-fg">{selected?.label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="scrollbar-none absolute left-0 right-0 z-50 mt-1.5 max-h-60 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors sm:py-2 ${
                  index === active ? "bg-surface-2" : ""
                } ${isSelected ? "font-medium text-accent" : "text-fg hover:bg-surface-2"}`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path
                      d="m5 12 5 5L20 7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "muted" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-[color:var(--color-success)]"
      : tone === "bad"
        ? "text-[color:var(--color-danger)]"
        : "text-fg";
  return (
    <div className="rounded-lg bg-surface-2/60 px-3 py-2.5">
      <div className={`font-display text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-fg-subtle">{label}</div>
    </div>
  );
}
