"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createExam, deleteExam, updateExamSettings } from "@/actions/exam-settings";
import type { ExamSettingsItem } from "@/lib/exam-settings";
import { useToast } from "@/components/admin/toast";
import { useConfirm } from "@/components/admin/confirm-dialog";

// JET exam settings (M6-S9, superadmin). One editable card per exam (name /
// status / questions-per-quiz / time limit / levels) plus a create form. Levels
// are edited as a comma list; the action blocks removing a level with questions.

const inputCls =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-0 sm:text-sm";

export function ExamSettingsManager({ exams }: { exams: ExamSettingsItem[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {exams.length === 0 ? (
        <p className="text-sm text-fg-muted">No exams yet — create one below.</p>
      ) : (
        exams.map((exam) => <ExamCard key={exam.id} exam={exam} />)
      )}

      {creating ? (
        <CreateExamForm onDone={() => setCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:w-fit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          Create exam
        </button>
      )}
    </div>
  );
}

function ExamCard({ exam }: { exam: ExamSettingsItem }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [name, setName] = useState(exam.name);
  const [status, setStatus] = useState<"active" | "inactive">(
    exam.status === "inactive" ? "inactive" : "active",
  );
  const [qpq, setQpq] = useState(String(exam.questionsPerQuiz));
  const [tl, setTl] = useState(String(exam.timeLimitMinutes));
  const [levels, setLevels] = useState(exam.levels.join(", "));
  const [err, setErr] = useState<Record<string, string>>({});

  const save = () => {
    setErr({});
    const levelList = levels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    start(async () => {
      const r = await updateExamSettings({
        id: exam.id,
        name,
        status,
        questionsPerQuiz: Number(qpq) || 0,
        timeLimitMinutes: Number(tl) || 0,
        levels: levelList,
      });
      if (r.ok) {
        toast.success("Exam settings saved.");
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not save the exam settings.");
      }
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete exam?",
      message: `Permanently delete "${exam.name}"? This removes its ${exam.questionCount} question${
        exam.questionCount === 1 ? "" : "s"
      }, all batch/student grants, and every attempt and score. This can't be undone.`,
      confirmLabel: "Delete exam",
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteExam({ id: exam.id });
      if (r.ok) {
        toast.success("Exam deleted.");
        router.refresh();
      } else toast.error(r.error.message || "Could not delete the exam.");
    });
  };

  return (
    <div className="border-b border-hairline py-5 first:pt-0">
      <div className="mb-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="tabular text-xs text-fg-subtle">{exam.slug}</span>
          <span className="text-xs text-fg-muted">· {exam.questionCount} questions</span>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="min-h-11 rounded-md border border-line px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface hover:text-[color:var(--color-danger)] disabled:opacity-60 sm:min-h-0 sm:border-0"
        >
          Delete exam
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-fg-muted">Name</span>
          <input
            name={`exam-${exam.id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Questions / quiz</span>
          <input
            name={`exam-${exam.id}-questionsPerQuiz`}
            value={qpq}
            onChange={(e) => setQpq(e.target.value)}
            inputMode="numeric"
            className={inputCls}
          />
          {err.questionsPerQuiz ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.questionsPerQuiz}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Time limit (min)</span>
          <input
            name={`exam-${exam.id}-timeLimitMinutes`}
            value={tl}
            onChange={(e) => setTl(e.target.value)}
            inputMode="numeric"
            className={inputCls}
          />
          {err.timeLimitMinutes ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.timeLimitMinutes}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
          <span className="text-xs font-medium text-fg-muted">Levels (comma-separated)</span>
          <input
            name={`exam-${exam.id}-levels`}
            value={levels}
            onChange={(e) => setLevels(e.target.value)}
            className={inputCls}
            placeholder="basic, medium, hard"
          />
          {err.levels ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.levels}</span>
          ) : null}
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Status</span>
          <div className="grid grid-cols-2 items-center gap-0.5 rounded-md bg-surface-2 p-0.5 sm:inline-flex sm:w-fit sm:bg-surface">
            {(["active", "inactive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={`min-h-10 rounded-[7px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                  status === s
                    ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function CreateExamForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [levels, setLevels] = useState("basic, medium, hard");
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = () => {
    setErr({});
    const levelList = levels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    start(async () => {
      const r = await createExam({ name, levels: levelList });
      if (r.ok) {
        toast.success("Exam created.");
        onDone();
        router.refresh();
      } else {
        if (r.error.fields) setErr(r.error.fields);
        toast.error(r.error.message || "Could not create the exam.");
      }
    });
  };

  return (
    <div className="border-t border-hairline pt-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Exam name</span>
          <input
            name="newExamName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="e.g. JET Accounting"
          />
          {err.name ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.name}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Levels (comma-separated)</span>
          <input
            name="newExamLevels"
            value={levels}
            onChange={(e) => setLevels(e.target.value)}
            className={inputCls}
            placeholder="basic, medium, hard"
          />
          {err.levels ? (
            <span className="text-xs text-[color:var(--color-danger)]">{err.levels}</span>
          ) : null}
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create exam"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-md px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
