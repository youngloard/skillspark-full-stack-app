"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { grantExamToBatches } from "@/actions/exam-grants";
import { useToast } from "@/components/admin/toast";
import { Modal } from "@/components/admin/modal";

// Bulk "grant exam to batches" (M6). Unlike a course (one per batch), exam
// grants are ADDITIVE — a batch can hold several — so there's no replace/skip
// decision: granting only ever adds, and a batch that already has the exam is
// left alone. Exams are few, so the list ships with the page (no search).

export type ExamOption = { id: string; name: string };

export function AssignExamDialog({
  batchIds,
  exams,
  onClose,
  onDone,
}: {
  batchIds: string[];
  exams: ExamOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [examId, setExamId] = useState<string | null>(exams.length === 1 ? exams[0].id : null);

  const submit = () => {
    if (!examId) {
      toast.error("Pick an exam first.");
      return;
    }
    start(async () => {
      let granted = 0;
      let alreadyHad = 0;
      // Chunked: the action caps each call at 200.
      for (let i = 0; i < batchIds.length; i += 200) {
        const r = await grantExamToBatches({ batchIds: batchIds.slice(i, i + 200), examId });
        if (!r.ok) {
          toast.error(r.error.message || "Could not grant the exam.");
          router.refresh();
          return;
        }
        granted += r.data.granted;
        alreadyHad += r.data.alreadyHad;
      }
      toast.success(
        granted === 0
          ? "Every selected batch already had this exam."
          : `Exam granted to ${granted} batch${granted === 1 ? "" : "es"}${
              alreadyHad > 0 ? ` (${alreadyHad} already had it)` : ""
            }.`,
      );
      onDone();
      router.refresh();
    });
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
        Grant an exam to {batchIds.length} batch{batchIds.length === 1 ? "" : "es"}
      </h2>

      <div className="mt-4">
        {exams.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No active exams yet — create one under Admins &amp; settings first.
          </p>
        ) : (
          <>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Exam</p>
            <div className="flex flex-col gap-1">
              {exams.map((exam) => {
                const active = exam.id === examId;
                return (
                  <button
                    key={exam.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setExamId(exam.id)}
                    className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                      active
                        ? "bg-accent/12 font-medium text-accent"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                    }`}
                  >
                    <span className="min-w-0 truncate">{exam.name}</span>
                    {active ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="m5 12.5 4.5 4.5L19 7.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              Batches can hold several exams — this adds one, and any batch that already has it is
              left untouched.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !examId}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Granting…" : "Grant exam"}
        </button>
      </div>
    </Modal>
  );
}
