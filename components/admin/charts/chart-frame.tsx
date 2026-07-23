// A titled chart region — an "invisible card": a heading + the plot, grouped by
// spacing only, no bordered box (owner: "only invisible cards"). Server
// component; every dashboard chart sits in one.

export function ChartFrame({
  title,
  subtitle,
  meta,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p> : null}
        </div>
        {meta ? <span className="tabular shrink-0 text-xs text-fg-subtle">{meta}</span> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
