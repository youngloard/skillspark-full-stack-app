import type { NamedValue } from "@/lib/admin-analytics-shared";
import { ChartHoverLayer } from "@/components/admin/charts/chart-hover-layer";

// A donut for composition data (parts of a whole) — a different form from the
// ranked bar lists, so the dashboard isn't a wall of horizontal bars. Pure
// server SVG: a ring of segments (distinct, legend-labelled colours), the total
// in the middle, and a legend with counts + shares. Pops in on load.

const SIZE = 168;
const C = SIZE / 2;
const R = 66;
const STROKE = 22;
const CIRC = 2 * Math.PI * R;

type Segment = NamedValue & { len: number; dashoffset: number; color: string; pct: number };

// Pure (module-level so it isn't render code): cumulative arc offsets per slice.
function buildSegments(data: NamedValue[], colors: string[], total: number): Segment[] {
  const segs: Segment[] = [];
  let acc = 0;
  for (let i = 0; i < data.length; i++) {
    const frac = data[i].value / total;
    segs.push({
      ...data[i],
      len: frac * CIRC,
      dashoffset: -acc * CIRC,
      color: colors[i % colors.length],
      pct: Math.round(frac * 100),
    });
    acc += frac;
  }
  return segs;
}

export function DonutChart({
  data,
  colors,
  emptyLabel = "No data yet.",
}: {
  data: NamedValue[];
  /** One CSS colour per slice (in data order). */
  colors: string[];
  emptyLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="py-8 text-sm text-fg-muted">{emptyLabel}</p>;

  const segments = buildSegments(data, colors, total);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4 sm:justify-start">
      <ChartHoverLayer>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Composition chart"
          className="pop-in shrink-0"
        >
          <g transform={`rotate(-90 ${C} ${C})`}>
            {segments.map((s) =>
              s.value > 0 ? (
                <circle
                  key={s.name}
                  cx={C}
                  cy={C}
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${s.len} ${CIRC - s.len}`}
                  strokeDashoffset={s.dashoffset}
                  data-tl={s.name}
                  data-tv={`${s.value.toLocaleString()} · ${s.pct}%`}
                >
                  <title>{`${s.name}: ${s.value} (${s.pct}%)`}</title>
                </circle>
              ) : null,
            )}
          </g>
          <text
            x={C}
            y={C - 3}
            textAnchor="middle"
            fontSize="28"
            fontWeight="600"
            fill="var(--fg)"
            style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}
          >
            {total.toLocaleString()}
          </text>
          <text x={C} y={C + 16} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">
            total
          </text>
        </svg>
      </ChartHoverLayer>

      {/* Compact, width-capped legend so it doesn't stretch and shrink the ring. */}
      <ul className="grid w-full max-w-[210px] gap-y-2">
        {segments.map((s) => (
          <li
            key={s.name}
            className="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5"
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            <span className="truncate text-[13px] text-fg">{s.name}</span>
            <span className="tabular text-[13px] font-semibold text-fg">
              {s.value.toLocaleString()}
            </span>
            <span className="tabular w-9 text-right text-xs text-fg-muted">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
