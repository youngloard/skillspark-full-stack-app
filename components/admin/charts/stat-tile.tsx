import { cn } from "@/lib/cn";

// A KPI figure — label, big mono number, optional hint. No card chrome: tiles
// sit in a grid separated by hairlines/space (invisible cards). The number uses
// tabular mono figures (the ledger rule, DESIGN.md §6).

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="tabular mt-1.5 text-[26px] font-semibold leading-none text-fg">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}
