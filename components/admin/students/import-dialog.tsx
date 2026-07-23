"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createCourse } from "@/actions/courses";
import { ensureBatchByName } from "@/actions/admin-provisioning";
import { searchBatchesAction, searchCoursesAction } from "@/actions/admin-search";
import { importStudentChunk } from "@/actions/student-import";
import { Combobox, type ComboItem } from "@/components/admin/combobox";
import { MultiCombobox, type MultiItem } from "@/components/admin/multi-combobox";
import { parseImportCsv, type ParsedRow } from "@/lib/student-import";
import { useToast } from "@/components/admin/toast";
import { useIsClient } from "@/lib/use-is-client";
import { lockBodyScroll } from "@/lib/scroll-lock";

// Bulk student import dialog (M6). Pick a CSV → preview + validate client-side →
// stream valid rows to the server in chunks with a live progress bar. Cols:
// 1 email · 2 "<code> <name>" · 3 batch (opt) · 4 course(s) (opt, several may
// be listed with "+"); new batches / courses are created and linked. Wide,
// self-contained portal (the shared Modal is intentionally narrow for edits).

const CHUNK_SIZE = 20;

type Tally = { created: number; exists: number; failed: number };
type ErrorLine = { email: string; message: string };
type Stage = "pick" | "preview" | "running" | "done";

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const mounted = useIsClient();
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [done, setDone] = useState(0);
  const [tally, setTally] = useState<Tally>({ created: 0, exists: 0, failed: 0 });
  const [errors, setErrors] = useState<ErrorLine[]>([]);
  const [fallbackBatch, setFallbackBatch] = useState<ComboItem | null>(null);
  const [fallbackCourses, setFallbackCourses] = useState<MultiItem[]>([]);
  const anyCreatedRef = useRef(false);

  const close = () => {
    if (anyCreatedRef.current) router.refresh();
    onClose();
  };

  useEffect(() => {
    const unlock = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stage !== "running" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const onPick = (file: File) => {
    setFallbackBatch(null);
    setFallbackCourses([]);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseImportCsv(String(reader.result ?? ""));
      if (parsed.length === 0) {
        toast.error("No rows found in that file.");
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setStage("preview");
    };
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsText(file);
  };

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);
  const missingBatchCount = valid.filter((r) => !r.batchName).length;
  const missingCourseCount = valid.filter((r) => r.courseNames.length === 0).length;
  const hasFileBatchForMissingCourse = valid.some((r) => r.courseNames.length === 0 && r.batchName);

  const searchBatches = async (q: string): Promise<ComboItem[]> => {
    const hits = await searchBatchesAction(q);
    return hits.map((batch) => ({
      id: batch.id,
      label: batch.batchName,
      sublabel: batch.batchCode,
    }));
  };

  const createBatchInline = async (name: string): Promise<ComboItem | null> => {
    const result = await ensureBatchByName({ name });
    if (result.ok) {
      toast.success(`Batch “${result.data.batchName}” ready.`);
      return {
        id: result.data.id,
        label: result.data.batchName,
        sublabel: result.data.batchCode,
      };
    }
    toast.error(result.error.message || "Could not create the batch.");
    return null;
  };

  const searchCourses = async (q: string): Promise<MultiItem[]> => {
    const hits = await searchCoursesAction(q);
    return hits.map((course) => ({ id: course.id, label: course.name }));
  };

  const createCourseInline = async (name: string): Promise<MultiItem | null> => {
    const result = await createCourse({ name, layout: "module" });
    if (result.ok) {
      toast.success(`Course “${name}” created.`);
      return { id: result.data.id, label: name };
    }
    toast.error(result.error.message || "Could not create the course.");
    return null;
  };

  const run = async () => {
    setStage("running");
    setDone(0);
    setTally({ created: 0, exists: 0, failed: 0 });
    setErrors([]);
    for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
      const chunk = valid.slice(i, i + CHUNK_SIZE);
      const r = await importStudentChunk({
        rows: chunk,
        fallbackBatchId: fallbackBatch?.id,
        fallbackCourseIds: fallbackCourses.map((c) => c.id),
      });
      if (r.ok) {
        const t: Tally = { created: 0, exists: 0, failed: 0 };
        const errs: ErrorLine[] = [];
        for (const o of r.data.outcomes) {
          if (o.status === "created") t.created++;
          else if (o.status === "exists") t.exists++;
          else {
            t.failed++;
            errs.push({ email: o.email, message: o.message ?? "Failed" });
          }
        }
        if (t.created > 0) anyCreatedRef.current = true;
        setTally((p) => ({
          created: p.created + t.created,
          exists: p.exists + t.exists,
          failed: p.failed + t.failed,
        }));
        if (errs.length) setErrors((p) => [...p, ...errs]);
      } else {
        // A whole chunk failed (auth / transport): count it as failed and move on.
        setTally((p) => ({ ...p, failed: p.failed + chunk.length }));
        setErrors((p) => [
          ...p,
          ...chunk.map((c) => ({ email: c.email, message: r.error.message || "Chunk failed" })),
        ]);
      }
      setDone(Math.min(i + chunk.length, valid.length));
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
      onMouseDown={(e) => e.target === e.currentTarget && stage !== "running" && close()}
    >
      <div className="flex h-dvh max-h-dvh w-full max-w-2xl flex-col bg-surface sm:h-auto sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-line sm:shadow-[0_24px_64px_-24px_rgba(2,20,20,0.6)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
              Bulk import students
            </h2>
            <p className="mt-0.5 text-xs text-fg-subtle">
              CSV columns: email · code + name · batch (optional) · courses (optional, use + for
              several)
            </p>
          </div>
          {stage !== "running" ? (
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
            <PickStep fileRef={fileRef} onPick={onPick} />
          ) : stage === "preview" ? (
            <PreviewStep
              fileName={fileName}
              rows={rows}
              validCount={valid.length}
              invalidCount={invalid.length}
              missingBatchCount={missingBatchCount}
              missingCourseCount={missingCourseCount}
              fallbackBatch={fallbackBatch}
              fallbackCourses={fallbackCourses}
              courseEnabled={Boolean(fallbackBatch) || hasFileBatchForMissingCourse}
              searchBatches={searchBatches}
              searchCourses={searchCourses}
              createBatch={createBatchInline}
              createCourse={createCourseInline}
              onBatchSelect={setFallbackBatch}
              onBatchClear={() => {
                setFallbackBatch(null);
                if (!hasFileBatchForMissingCourse) setFallbackCourses([]);
              }}
              onCoursesChange={setFallbackCourses}
            />
          ) : (
            <ProgressStep
              stage={stage}
              pct={pct}
              done={done}
              total={valid.length}
              tally={tally}
              errors={errors}
            />
          )}
        </div>

        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4">
          {stage === "preview" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setFallbackBatch(null);
                  setFallbackCourses([]);
                  setStage("pick");
                }}
                className="min-h-11 w-full rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto"
              >
                Choose another file
              </button>
              <button
                type="button"
                onClick={run}
                disabled={valid.length === 0}
                className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
              >
                Import {valid.length} student{valid.length === 1 ? "" : "s"}
              </button>
            </>
          ) : stage === "running" ? (
            <span className="py-2 text-center text-sm text-fg-muted sm:py-0 sm:text-left">
              Importing… please keep this open.
            </span>
          ) : stage === "done" ? (
            <button
              type="button"
              onClick={close}
              className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:w-auto"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="min-h-11 w-full rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-auto"
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

function PickStep({
  fileRef,
  onPick,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
        className={`flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors sm:px-6 sm:py-12 ${
          dragging ? "border-accent bg-accent/5" : "border-line hover:border-fg-subtle"
        }`}
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
          Drop a CSV here, or <span className="text-accent">browse</span>
        </span>
        <span className="text-xs text-fg-subtle">
          One row per student. First row may be a header — it is detected automatically.
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        name="studentImportFile"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = ""; // allow re-picking the same file
        }}
      />
    </div>
  );
}

function PreviewStep({
  fileName,
  rows,
  validCount,
  invalidCount,
  missingBatchCount,
  missingCourseCount,
  fallbackBatch,
  fallbackCourses,
  courseEnabled,
  searchBatches,
  searchCourses,
  createBatch,
  createCourse,
  onBatchSelect,
  onBatchClear,
  onCoursesChange,
}: {
  fileName: string;
  rows: ParsedRow[];
  validCount: number;
  invalidCount: number;
  missingBatchCount: number;
  missingCourseCount: number;
  fallbackBatch: ComboItem | null;
  fallbackCourses: MultiItem[];
  courseEnabled: boolean;
  searchBatches: (q: string) => Promise<ComboItem[]>;
  searchCourses: (q: string) => Promise<MultiItem[]>;
  createBatch: (name: string) => Promise<ComboItem | null>;
  createCourse: (name: string) => Promise<MultiItem | null>;
  onBatchSelect: (item: ComboItem) => void;
  onBatchClear: () => void;
  onCoursesChange: (next: MultiItem[]) => void;
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const previewRows = rows.slice(0, 200);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-fg">{fileName}</span>
        <span className="text-fg-muted">
          {validCount} ready
          {invalidCount > 0 ? (
            <span className="text-[color:var(--color-danger)]"> · {invalidCount} skipped</span>
          ) : null}
        </span>
      </div>
      {missingBatchCount > 0 || missingCourseCount > 0 ? (
        <div className="mb-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-fg">Fill missing CSV values</h3>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Optional choices apply only where the CSV cell is blank. Values in the file take
              priority.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {missingBatchCount > 0 ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-muted">
                  Batch for {missingBatchCount} missing row{missingBatchCount === 1 ? "" : "s"}
                </label>
                <Combobox
                  value={fallbackBatch}
                  placeholder="Search a batch, or create one…"
                  search={searchBatches}
                  onSelect={onBatchSelect}
                  onClear={onBatchClear}
                  onCreate={createBatch}
                  createLabel={(name) => `Create batch “${name}”`}
                />
              </div>
            ) : null}
            {missingCourseCount > 0 ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-muted">
                  Course for {missingCourseCount} missing row
                  {missingCourseCount === 1 ? "" : "s"}
                </label>
                <MultiCombobox
                  label="Fallback courses"
                  selected={fallbackCourses}
                  placeholder={courseEnabled ? "Search courses…" : "Pick a batch first"}
                  search={searchCourses}
                  onChange={onCoursesChange}
                  onCreate={createCourse}
                  createLabel={(name) => `Create course “${name}”`}
                  disabled={!courseEnabled}
                />
                <p className="mt-1.5 text-xs text-fg-subtle">
                  Applied only to rows that have a batch. A batch can hold several courses.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="border-t border-line sm:hidden">
        {previewRows.map((row, index) => (
          <MobilePreviewRow
            key={index}
            row={row}
            index={index}
            expanded={expandedRow === index}
            fallbackBatch={fallbackBatch}
            fallbackCourses={fallbackCourses}
            onToggle={() => setExpandedRow((current) => (current === index ? null : index))}
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-fg-subtle">
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Batch</th>
              <th className="py-2 font-medium">Course</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((r, i) => (
              <tr
                key={i}
                className={`border-b border-hairline ${r.error ? "bg-[color:var(--color-danger)]/5" : ""}`}
              >
                <td className="py-3 pr-4 text-fg">
                  {r.email || <span className="text-fg-subtle">—</span>}
                  {r.error ? (
                    <span className="mt-0.5 block text-xs text-[color:var(--color-danger)]">
                      {r.error}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-fg-muted">{r.code || "—"}</td>
                <td className="py-3 pr-4 text-fg-muted">{r.name || "—"}</td>
                <td className="py-3 pr-4 text-fg-muted">
                  {r.batchName ??
                    (fallbackBatch && !r.error ? (
                      <span className="text-accent">{fallbackBatch.label} · fallback</span>
                    ) : (
                      "—"
                    ))}
                </td>
                <td className="py-3 text-fg-muted">
                  {r.courseNames.length > 0 ? (
                    r.courseNames.join(", ")
                  ) : fallbackCourses.length > 0 && (r.batchName || fallbackBatch) && !r.error ? (
                    <span className="text-accent">
                      {fallbackCourses.map((c) => c.label).join(", ")} · fallback
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 200 ? (
        <p className="mt-2 text-xs text-fg-subtle">
          Showing the first 200 of {rows.length} rows. All valid rows will be imported.
        </p>
      ) : null}
    </div>
  );
}

function MobilePreviewRow({
  row,
  index,
  expanded,
  fallbackBatch,
  fallbackCourses,
  onToggle,
}: {
  row: ParsedRow;
  index: number;
  expanded: boolean;
  fallbackBatch: ComboItem | null;
  fallbackCourses: MultiItem[];
  onToggle: () => void;
}) {
  const label = row.name || row.email || `Student row ${index + 1}`;
  const batch = row.batchName ?? (fallbackBatch && !row.error ? fallbackBatch.label : null);
  const course =
    row.courseNames.length > 0
      ? row.courseNames.join(", ")
      : fallbackCourses.length > 0 && (row.batchName || fallbackBatch) && !row.error
        ? fallbackCourses.map((c) => c.label).join(", ")
        : null;
  const batchIsFallback = !row.batchName && Boolean(batch);
  const courseIsFallback = row.courseNames.length === 0 && Boolean(course);
  const detailsId = `student-import-row-${index}`;

  return (
    <div
      className={`border-b border-hairline ${row.error ? "bg-[color:var(--color-danger)]/5" : ""}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{label}</span>
          {row.name && row.email ? (
            <span className="mt-0.5 block truncate text-xs text-fg-subtle">{row.email}</span>
          ) : row.code ? (
            <span className="mt-0.5 block truncate text-xs text-fg-subtle">{row.code}</span>
          ) : null}
        </span>
        <span
          className={`shrink-0 text-xs font-medium ${
            row.error ? "text-[color:var(--color-danger)]" : "text-fg-muted"
          }`}
        >
          {row.error ? "Skipped" : "Ready"}
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {expanded ? (
        <div id={detailsId} className="pb-4">
          <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-fg-subtle">Email</dt>
            <dd className="break-all text-fg-muted">{row.email || "—"}</dd>
            <dt className="text-fg-subtle">Code</dt>
            <dd className="break-words text-fg-muted">{row.code || "—"}</dd>
            <dt className="text-fg-subtle">Name</dt>
            <dd className="break-words text-fg-muted">{row.name || "—"}</dd>
            <dt className="text-fg-subtle">Batch</dt>
            <dd className={`break-words ${batchIsFallback ? "text-accent" : "text-fg-muted"}`}>
              {batch ? `${batch}${batchIsFallback ? " · fallback" : ""}` : "—"}
            </dd>
            <dt className="text-fg-subtle">Course</dt>
            <dd className={`break-words ${courseIsFallback ? "text-accent" : "text-fg-muted"}`}>
              {course ? `${course}${courseIsFallback ? " · fallback" : ""}` : "—"}
            </dd>
          </dl>
          {row.error ? (
            <p className="mt-3 text-xs text-[color:var(--color-danger)]" role="alert">
              {row.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressStep({
  stage,
  pct,
  done,
  total,
  tally,
  errors,
}: {
  stage: Stage;
  pct: number;
  done: number;
  total: number;
  tally: Tally;
  errors: ErrorLine[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-fg">
          {stage === "done" ? "Import complete" : "Importing…"}
        </span>
        <span className="text-fg-muted">
          {done} / {total}
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
        <Stat label="Already existed" value={tally.exists} tone="muted" />
        <Stat label="Failed" value={tally.failed} tone="bad" />
      </div>
      {errors.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-fg-muted">
            Rows that could not be imported
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-line">
            <ul className="divide-y divide-line text-sm">
              {errors.map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="truncate text-fg">{e.email || "—"}</span>
                  <span className="shrink-0 text-xs text-[color:var(--color-danger)]">
                    {e.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
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
