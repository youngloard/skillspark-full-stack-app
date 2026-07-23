// Shared presentational pieces for the quiz + review screens (M5-S6/S7):
// the question-number navigator and the debit/credit ledger table. Imported by
// both the live runner and the past-attempt review, so they look identical.

export type NavState = "answered" | "empty" | "correct" | "wrong" | "unattended";

const NAV_TONE: Record<NavState, string> = {
  answered: "bg-accent/15 text-accent",
  empty: "border border-line text-fg-subtle",
  correct: "bg-accent/15 text-accent",
  wrong: "bg-danger/15 text-danger",
  unattended: "border border-line text-fg-subtle",
};

export const levelLabel = (level: string) => level.charAt(0).toUpperCase() + level.slice(1);
const fmtAmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());

export function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Navigator({
  total,
  current,
  onGo,
  state,
  legend,
}: {
  total: number;
  current: number;
  onGo: (i: number) => void;
  state: (i: number) => NavState;
  legend: { label: string; state: NavState }[];
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const isCurrent = i === current;
          const tone = isCurrent ? "bg-accent text-accent-fg" : NAV_TONE[state(i)];
          return (
            <button
              key={i}
              type="button"
              onClick={() => onGo(i)}
              aria-current={isCurrent ? "true" : undefined}
              className={`tabular grid h-11 w-11 place-items-center rounded-md text-xs font-semibold transition-colors sm:h-8 sm:w-8 ${tone}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
        {legend.map((it) => (
          <span key={it.label} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded ${NAV_TONE[it.state]}`} />
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export type LedgerRow = {
  account: string;
  debit: number | null;
  credit: number | null;
  accountOk?: boolean;
  debitOk?: boolean;
  creditOk?: boolean;
};

export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const cell = (ok: boolean | undefined) => (ok === false ? "text-danger" : "text-fg");
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        <span>Account</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
      </div>
      <div className="divide-y divide-line">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-2 text-sm"
          >
            <span className={`truncate ${cell(r.accountOk)}`}>{r.account || "—"}</span>
            <span className={`tabular text-right ${cell(r.debitOk)}`}>{fmtAmt(r.debit)}</span>
            <span className={`tabular text-right ${cell(r.creditOk)}`}>{fmtAmt(r.credit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
