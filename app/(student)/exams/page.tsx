import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/authorization";
import { getAccessibleExams } from "@/lib/exam-access";

// Exams index (M5-S6). Most students have exactly one exam (JET) — go straight
// to it. Otherwise list them; empty state when none are granted.

function CapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.7 2.6 6 2.6s6-1.6 6-2.6v-5" />
    </svg>
  );
}

export default async function ExamsPage() {
  const ctx = await requireStudent().catch(() => null);
  if (!ctx) redirect("/login?error=access");

  const exams = await getAccessibleExams(ctx.student.id);
  if (exams.length === 1) redirect(`/exams/${exams[0]!.id}`);

  return (
    <div className="w-full px-5 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fg-subtle">Practise</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-fg sm:text-[2.5rem]">
          Exams
        </h1>
      </header>

      {exams.length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4 border-t border-line pt-10">
          <CapIcon className="h-9 w-9 text-accent/70" />
          <div>
            <h2 className="font-display text-xl font-semibold text-fg">No exams yet</h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-fg-muted">
              Your admin hasn&apos;t granted you an exam yet. It&apos;ll appear here when they do.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <Link
              key={exam.id}
              href={`/exams/${exam.id}`}
              className="group rounded-lg border border-line bg-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:border-accent/30"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-subtle">
                Exam
              </p>
              <h2 className="mt-1.5 font-display text-lg font-semibold text-fg transition-colors group-hover:text-accent">
                {exam.name}
              </h2>
              <p className="mt-1.5 text-sm text-fg-muted">
                Timed accounting-entry practice with instant scoring.
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
