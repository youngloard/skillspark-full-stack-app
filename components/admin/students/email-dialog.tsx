"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sendStudentEmails } from "@/actions/emails";
import { renderCustomEmail, renderWelcomeEmail } from "@/lib/email-templates";
import { useToast } from "@/components/admin/toast";
import { useIsClient } from "@/lib/use-is-client";
import { lockBodyScroll } from "@/lib/scroll-lock";

// Send email to the selected students (M8). Pick a template, preview the exact
// HTML that will go out, then send in chunks with a progress bar. The preview
// renders the shared template module, so what you see is what is sent.

const CHUNK = 25;
type Stage = "compose" | "sending" | "done";

const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function EmailDialog({
  studentIds,
  sampleName,
  platformUrl,
  onClose,
  onSent,
}: {
  studentIds: string[];
  /** A recipient's name, so the preview reads like a real message. */
  sampleName: string;
  platformUrl: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const mounted = useIsClient();
  const toast = useToast();

  const [stage, setStage] = useState<Stage>("compose");
  const [template, setTemplate] = useState<"welcome" | "custom">("welcome");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [done, setDone] = useState(0);
  const [sent, setSent] = useState(0);
  const [errors, setErrors] = useState<{ email: string; error: string }[]>([]);
  const sentAnyRef = useRef(false);

  const close = () => {
    if (sentAnyRef.current) onSent();
    onClose();
  };

  useEffect(() => {
    const unlock = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stage !== "sending" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const preview =
    template === "welcome"
      ? renderWelcomeEmail({
          studentName: sampleName,
          studentEmail: "student@example.com",
          platformUrl,
        })
      : renderCustomEmail({
          studentName: sampleName,
          subject: subject || "(no subject)",
          message: message || "(your message)",
          platformUrl,
        });

  const canSend =
    studentIds.length > 0 && (template === "welcome" || (subject.trim() && message.trim()));

  const run = async () => {
    if (!canSend) {
      toast.error("Add a subject and message first.");
      return;
    }
    setStage("sending");
    setDone(0);
    setSent(0);
    setErrors([]);
    for (let i = 0; i < studentIds.length; i += CHUNK) {
      const chunk = studentIds.slice(i, i + CHUNK);
      const r = await sendStudentEmails({
        studentIds: chunk,
        template,
        ...(template === "custom" ? { subject: subject.trim(), message: message.trim() } : {}),
      });
      if (r.ok) {
        const okCount = r.data.outcomes.filter((o) => o.ok).length;
        if (okCount > 0) sentAnyRef.current = true;
        setSent((p) => p + okCount);
        const errs = r.data.outcomes
          .filter((o) => !o.ok)
          .map((o) => ({ email: o.email, error: o.error ?? "Failed" }));
        if (errs.length) setErrors((p) => [...p, ...errs]);
      } else {
        setErrors((p) => [
          ...p,
          ...chunk.map(() => ({ email: "—", error: r.error.message || "Send failed" })),
        ]);
      }
      setDone(Math.min(i + chunk.length, studentIds.length));
    }
    setStage("done");
  };

  if (!mounted) return null;
  const pct = studentIds.length ? Math.round((done / studentIds.length) * 100) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && stage !== "sending" && close()}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-surface shadow-[0_24px_64px_-24px_rgba(2,20,20,0.6)]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-fg">
              Email {studentIds.length} student{studentIds.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Sent from your SkillSpark coordinator address
            </p>
          </div>
          {stage !== "sending" ? (
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {stage === "compose" ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Template</p>
                <div className="flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-0.5">
                  {(
                    [
                      { id: "welcome", label: "Welcome / how to sign in" },
                      { id: "custom", label: "Custom message" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={template === t.id}
                      onClick={() => setTemplate(t.id)}
                      className={`rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        template === t.id
                          ? "bg-bg text-fg shadow-[0_1px_2px_rgba(2,20,20,0.12)]"
                          : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {template === "welcome" ? (
                <p className="rounded-lg bg-surface-2/60 px-3 py-2.5 text-sm text-fg-muted">
                  Tells each student their account is ready and walks them through signing in with
                  Google using their registered address, with a button to the platform.
                </p>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-fg-muted">Subject</span>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. New course material is live"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-fg-muted">Message</span>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={6}
                      className={`${inputCls} resize-y`}
                      placeholder="Write your message. Blank lines start a new paragraph."
                    />
                    <span className="text-xs text-fg-subtle">
                      Each student is greeted by their first name automatically.
                    </span>
                  </label>
                </>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
                >
                  {showPreview ? "Hide preview" : "Preview email"}
                </button>
                {showPreview ? (
                  <div className="mt-2 overflow-hidden rounded-lg border border-line">
                    <div className="border-b border-line bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                      Subject: <span className="text-fg">{preview.subject}</span>
                    </div>
                    <iframe
                      title="Email preview"
                      srcDoc={preview.html}
                      sandbox=""
                      className="h-80 w-full bg-white"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-fg">
                  {stage === "done" ? "Send complete" : "Sending…"}
                </span>
                <span className="text-fg-muted">
                  {done} / {studentIds.length}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-2/60 px-3 py-2.5">
                  <div className="font-display text-xl font-semibold tabular-nums text-[color:var(--color-success)]">
                    {sent}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-subtle">Sent</div>
                </div>
                <div className="rounded-lg bg-surface-2/60 px-3 py-2.5">
                  <div className="font-display text-xl font-semibold tabular-nums text-[color:var(--color-danger)]">
                    {errors.length}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-subtle">Failed</div>
                </div>
              </div>
              {errors.length > 0 ? (
                <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-line">
                  <ul className="divide-y divide-line text-sm">
                    {errors.map((e, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
                        <span className="truncate text-fg">{e.email}</span>
                        <span className="shrink-0 text-xs text-[color:var(--color-danger)]">
                          {e.error}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          {stage === "compose" ? (
            <>
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={!canSend}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                Send to {studentIds.length}
              </button>
            </>
          ) : stage === "sending" ? (
            <span className="text-sm text-fg-muted">Sending… keep this open.</span>
          ) : (
            <button
              type="button"
              onClick={close}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
