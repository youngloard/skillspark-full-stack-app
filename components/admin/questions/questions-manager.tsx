"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  bulkDeleteQuestions,
  deleteQuestion,
  listQuestions,
  selectAllQuestionIds,
} from "@/actions/questions";
import type { QuestionListItem } from "@/lib/questions";
import { useToast } from "@/components/admin/toast";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { BulkBar } from "@/components/admin/bulk-bar";
import { Checkbox } from "@/components/admin/checkbox";
import { QuestionEditor } from "@/components/admin/questions/question-editor";
import { QuestionImportDialog } from "@/components/admin/questions/question-import-dialog";

// Questions surface (M6-S7): exam picker + multi-level filter + bank search, a
// keyset-paginated list (expand a row to see its options + answer matrix), and
// add / edit / delete / bulk-delete. Filters and pagination call the list
// action directly so the exam/level/search switch stays instant.

type Exam = { id: string; name: string; levels: string[] };
const PAGE_SIZE = 20;

export function QuestionsManager({
  exams,
  initialExamId,
  initialLevels,
  initialItems,
  initialCursor,
  initialTotal,
  isSuperAdmin,
}: {
  exams: Exam[];
  initialExamId: string;
  initialLevels: string[];
  initialItems: QuestionListItem[];
  initialCursor: string | null;
  initialTotal: number;
  isSuperAdmin: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  const [examId, setExamId] = useState(initialExamId);
  const [availableLevels, setAvailableLevels] = useState(initialLevels);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<QuestionListItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageStarts, setPageStarts] = useState<Array<string | undefined>>([undefined]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [editing, setEditing] = useState<QuestionListItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const clearSelection = () => {
    setSelected(new Set());
    setAllFiltered(false);
  };

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const load = (opts: {
    examId?: string;
    levels?: string[];
    search?: string;
    cursor?: string;
    page?: number;
    resetHistory?: boolean;
  }) => {
    const nextExam = opts.examId ?? examId;
    const nextLevels = opts.levels ?? selectedLevels;
    const nextSearch = opts.search ?? search;
    const targetPage = opts.page ?? 1;
    const currentRequest = ++requestId.current;
    start(async () => {
      const r = await listQuestions({
        examId: nextExam,
        ...(nextLevels.length ? { levels: nextLevels } : {}),
        ...(nextSearch.trim() ? { search: nextSearch.trim() } : {}),
        ...(opts.cursor ? { cursor: opts.cursor } : {}),
        limit: PAGE_SIZE,
      });
      if (currentRequest !== requestId.current) return;
      if (r.ok) {
        setItems(r.data.items);
        setNextCursor(r.data.nextCursor);
        setTotal(r.data.total);
        setPage(targetPage);
        if (opts.resetHistory !== false) setPageStarts([undefined]);
        clearSelection();
      } else {
        toast.error(r.error.message || "Could not load questions.");
      }
    });
  };

  const goNext = () => {
    if (!nextCursor) return;
    const targetPage = page + 1;
    setPageStarts((previous) => {
      const next = previous.slice(0, page);
      next[targetPage - 1] = nextCursor;
      return next;
    });
    load({ cursor: nextCursor, page: targetPage, resetHistory: false });
  };

  const goPrevious = () => {
    if (page <= 1) return;
    load({ cursor: pageStarts[page - 2], page: page - 1, resetHistory: false });
  };

  const onExamChange = (id: string) => {
    const exam = exams.find((e) => e.id === id);
    setExamId(id);
    setAvailableLevels(exam?.levels ?? []);
    setSelectedLevels([]);
    load({ examId: id, levels: [] });
  };

  const onSearch = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load({ search: v }), 300);
  };

  const toggle = (id: string) => {
    setAllFiltered(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = items.length > 0 && items.every((q) => selected.has(q.id));
  const toggleAll = () => {
    setAllFiltered(false);
    setSelected(allSelected ? new Set() : new Set(items.map((question) => question.id)));
  };

  const selectAllFiltered = () => {
    start(async () => {
      const result = await selectAllQuestionIds({
        examId,
        ...(selectedLevels.length ? { levels: selectedLevels } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      if (!result.ok) {
        toast.error(result.error.message || "Could not select all matching questions.");
        return;
      }
      setSelected(new Set(result.data.ids));
      setAllFiltered(true);
      if (result.data.capped) {
        toast.success(`Selected the first ${result.data.ids.length} questions (the maximum).`);
      }
    });
  };

  const rowDelete = async (q: QuestionListItem) => {
    const ok = await confirm({
      title: "Delete question?",
      message: `Delete question ${q.sourceQuestionNo}? This removes its options and answer rows.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteQuestion({ id: q.id });
      if (r.ok) {
        toast.success("Question deleted.");
        setItems((prev) => prev.filter((x) => x.id !== q.id));
        setTotal((previous) => Math.max(0, previous - 1));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(q.id);
          return next;
        });
      } else toast.error(r.error.message || "Could not delete the question.");
    });
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: `Delete ${ids.length} question${ids.length === 1 ? "" : "s"}?`,
      message: "This removes the selected questions and their answer rows.",
      confirmLabel: "Delete all",
    });
    if (!ok) return;
    start(async () => {
      let deleted = 0;
      for (let index = 0; index < ids.length; index += 1_000) {
        const result = await bulkDeleteQuestions({ examId, ids: ids.slice(index, index + 1_000) });
        if (!result.ok) {
          toast.error(result.error.message || "Could not delete the selected questions.");
          clearSelection();
          load({});
          return;
        }
        deleted += result.data.deleted;
      }
      toast.success(`${deleted} deleted.`);
      clearSelection();
      load({});
    });
  };

  const currentExam = exams.find((e) => e.id === examId);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap">
        {/* Exam picker (custom segmented buttons; usually 1–3 exams). */}
        <div className="col-span-2 flex w-fit max-w-full justify-self-start items-center gap-0.5 overflow-x-auto rounded-md bg-surface-2 p-0.5 sm:col-span-1">
          {exams.map((e) => {
            const active = e.id === examId;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={active}
                onClick={() => onExamChange(e.id)}
                className={`min-h-10 shrink-0 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {e.name}
              </button>
            );
          })}
        </div>

        <div className="relative col-span-2 min-w-0 flex-1 sm:col-span-1 sm:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="m20 20-3.2-3.2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type="search"
            name="question-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search number, level, or question…"
            aria-label="Search questions by number, level, or question text"
            className="min-h-11 w-full rounded-md bg-surface-2 py-2 pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:text-sm"
          />
        </div>

        <LevelFilter
          levels={availableLevels}
          selected={selectedLevels}
          onChange={(next) => {
            setSelectedLevels(next);
            load({ levels: next });
          }}
        />

        <button
          type="button"
          onClick={() => setImporting(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto sm:px-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15V3m0 0L8 7m4-4 4 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Import questions
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:w-auto sm:px-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          Add question
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">
          {search.trim() || selectedLevels.length > 0
            ? "No questions match these filters."
            : "No questions in this exam yet."}
        </p>
      ) : (
        <>
          {allSelected && total > items.length ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-lg bg-surface-2/60 px-4 py-2.5 text-sm">
              {allFiltered ? (
                <>
                  <span className="text-fg">
                    All {selected.size} matching questions are selected.
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="font-medium text-accent transition-opacity hover:opacity-80"
                  >
                    Clear selection
                  </button>
                </>
              ) : (
                <>
                  <span className="text-fg-muted">
                    All {items.length} on this page are selected.
                  </span>
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    disabled={pending}
                    className="font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    Select all {total} matching
                  </button>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-2 hidden items-center gap-3 border-b border-line pb-2 text-xs uppercase tracking-wide text-fg-subtle sm:flex">
            <span className="w-8">
              <Checkbox checked={allSelected} onChange={toggleAll} ariaLabel="Select all" />
            </span>
            <span className="w-16">No.</span>
            <span className="w-20">Level</span>
            <span className="flex-1">Prompt</span>
          </div>
          <ul className="flex flex-col">
            {items.map((q) => (
              <QuestionRow
                key={q.id}
                q={q}
                selected={selected.has(q.id)}
                onToggle={() => toggle(q.id)}
                onEdit={() => setEditing(q)}
                onDelete={() => rowDelete(q)}
                pending={pending}
              />
            ))}
          </ul>

          <QuestionPagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            pending={pending}
            canNext={nextCursor !== null}
            onPrevious={goPrevious}
            onNext={goNext}
          />
        </>
      )}

      <BulkBar
        count={selected.size}
        noun="question"
        pending={pending}
        onDelete={bulkDelete}
        onClear={clearSelection}
      />

      {importing ? (
        <QuestionImportDialog
          examId={examId}
          levels={availableLevels}
          onClose={() => setImporting(false)}
          onImported={() => load({})}
        />
      ) : null}
      {adding && currentExam ? (
        <QuestionEditor
          mode="create"
          examId={examId}
          levels={availableLevels}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load({});
          }}
        />
      ) : null}
      {editing ? (
        <QuestionEditor
          mode="edit"
          examId={examId}
          levels={availableLevels}
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load({});
          }}
        />
      ) : null}

      {!isSuperAdmin ? (
        <p className="mt-2 text-xs text-fg-subtle">
          Deleting a whole level or every question requires the super admin.
        </p>
      ) : null}
    </div>
  );
}

function LevelFilter({
  levels,
  selected,
  onChange,
}: {
  levels: string[];
  selected: string[];
  onChange: (levels: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocumentDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const label =
    selected.length === 0
      ? "All levels"
      : selected.length === 1
        ? selected[0]![0]!.toUpperCase() + selected[0]!.slice(1)
        : `${selected.length} levels`;

  const toggle = (level: string) => {
    if (selected.includes(level)) onChange(selected.filter((value) => value !== level));
    else onChange([...selected, level]);
  };

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter questions by level"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9 sm:w-auto"
      >
        <span className="max-w-[170px] truncate">{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 z-40 mt-1.5 w-[min(14rem,calc(100vw-2.5rem))] space-y-0.5 rounded-lg border border-line bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(2,20,20,0.4)]"
        >
          <LevelOption
            label="All levels"
            selected={selected.length === 0}
            onClick={() => onChange([])}
          />
          {levels.map((level) => (
            <LevelOption
              key={level}
              label={level.charAt(0).toUpperCase() + level.slice(1)}
              selected={selected.includes(level)}
              onClick={() => toggle(level)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LevelOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-[13px] transition-colors ${
        selected ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      <span>{label}</span>
      {selected ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-accent"
        >
          <path
            d="m5 12 5 5 9-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

function QuestionPagination({
  page,
  pageCount,
  total,
  pending,
  canNext,
  onPrevious,
  onNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  pending: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const countLine = `${total.toLocaleString()} questions`;
  if (pageCount <= 1) return <p className="mt-6 text-xs text-fg-subtle">{countLine}</p>;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-fg-subtle">
        Page {page} of {pageCount} · {countLine}
      </p>
      <div className="flex items-center gap-2">
        <QuestionPageButton label="Previous" disabled={pending || page <= 1} onClick={onPrevious}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m15 6-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Prev
        </QuestionPageButton>
        <QuestionPageButton label="Next" disabled={pending || !canNext} onClick={onNext}>
          Next
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m9 6 6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </QuestionPageButton>
      </div>
    </div>
  );
}

function QuestionPageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:bg-transparent disabled:text-fg-subtle disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function QuestionRow({
  q,
  selected,
  onToggle,
  onEdit,
  onDelete,
  pending,
}: {
  q: QuestionListItem;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-hairline py-3">
      <div className="flex items-center gap-3">
        <span className="grid min-h-11 w-8 shrink-0 place-items-center sm:min-h-0">
          <Checkbox
            checked={selected}
            onChange={onToggle}
            ariaLabel={`Select question ${q.sourceQuestionNo}`}
          />
        </span>
        <span className="tabular hidden w-16 shrink-0 text-sm text-fg-muted sm:block">
          {q.sourceQuestionNo}
        </span>
        <span className="hidden w-20 shrink-0 sm:block">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs capitalize text-fg-muted">
            {q.level}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left text-sm text-fg transition-colors hover:text-accent sm:min-h-0"
        >
          <span className="min-w-0 flex-1">
            <span className="mb-1 flex items-center gap-2 sm:hidden">
              <span className="tabular text-xs text-fg-muted">No. {q.sourceQuestionNo}</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs capitalize text-fg-muted">
                {q.level}
              </span>
            </span>
            <span className="block line-clamp-2 sm:truncate">{q.prompt}</span>
          </span>
          <svg
            className={`shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none sm:hidden ${open ? "rotate-180" : ""}`}
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
        </button>
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {open ? "Hide" : "View"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-[color:var(--color-danger)] disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-5 sm:pl-11 lg:grid-cols-2">
          <div className="flex gap-2 sm:hidden">
            <button
              type="button"
              onClick={onEdit}
              className="min-h-11 flex-1 rounded-md border border-line px-3 text-sm font-medium text-fg-muted"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="min-h-11 flex-1 rounded-md border border-line px-3 text-sm font-medium text-[color:var(--color-danger)] disabled:opacity-60"
            >
              Delete
            </button>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Options
            </p>
            <ul className="flex flex-col gap-1">
              {q.options.map((o) => (
                <li key={o.optionIndex} className="text-sm text-fg-muted">
                  {String.fromCharCode(65 + o.optionIndex)}. {o.optionText}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Answer rows
            </p>
            {q.answerRows.length === 0 ? (
              <p className="text-sm text-fg-muted">No answer rows.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-subtle">
                    <th className="pb-1 font-medium">Account</th>
                    <th className="pb-1 text-right font-medium">Debit</th>
                    <th className="pb-1 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {q.answerRows.map((r) => (
                    <tr key={r.rowIndex} className="border-t border-hairline">
                      <td className="py-1 text-fg">{r.account}</td>
                      <td className="tabular py-1 text-right text-fg-muted">{r.debit ?? "—"}</td>
                      <td className="tabular py-1 text-right text-fg-muted">{r.credit ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
