import type { SeriesPoint } from "@/lib/admin-analytics-shared";
import { ChartHoverLayer } from "@/components/admin/charts/chart-hover-layer";

// A pure-SVG time series — no chart library, no client JS. It renders on the
// server, themes through CSS variables (so light/dark and print all follow the
// role tokens), prints crisp (vector, not canvas), and carries native <title>
// tooltips for hover + screen readers. Single teal series; selective data
// labels (the owner wants values visible, but not one on every one of 90 days).

type Variant = "area" | "bar";

const W = 760;
const H = 248;
const PAD = { left: 40, right: 18, top: 26, bottom: 30 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;
const BASELINE = PAD.top + INNER_H;
const GRID = 4;
// Headroom reserved at the top of the plot so the tallest bar/point never
// reaches the ceiling — its value label always sits ABOVE the mark, never
// clipped inside it.
const LABEL_BAND = 20;

function niceStep(x: number): number {
  if (x <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  const n = x / pow;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * pow;
}

export function SeriesChart({
  data,
  variant = "area",
  valueSuffix = "",
  emptyLabel = "No activity in this range yet.",
}: {
  data: SeriesPoint[];
  variant?: Variant;
  /** Appended to each value label (e.g. "%" for a categorical column chart). */
  valueSuffix?: string;
  emptyLabel?: string;
}) {
  const n = data.length;
  const maxVal = Math.max(...data.map((d) => d.value), 0);

  if (n === 0 || maxVal === 0) {
    return <p className="py-8 text-sm text-fg-muted">{emptyLabel}</p>;
  }

  const step = niceStep(maxVal / GRID);
  const niceMax = step * GRID;
  // Map the value range into the plot MINUS the top label band, so v === niceMax
  // lands at PAD.top + LABEL_BAND, leaving room for the label above it.
  const usableH = INNER_H - LABEL_BAND;
  const yFor = (v: number) => PAD.top + LABEL_BAND + usableH * (1 - v / niceMax);

  const band = INNER_W / n;
  const xLine = (i: number) =>
    n === 1 ? PAD.left + INNER_W / 2 : PAD.left + i * (INNER_W / (n - 1));
  const xBand = (i: number) => PAD.left + i * band;

  // Which points get a value label / an axis tick (avoid crowding on wide ranges).
  const labelAll = n <= 14;
  const tickEvery = labelAll ? 1 : Math.ceil(n / 12);
  const maxIdx = data.reduce((mi, d, i) => (d.value > data[mi].value ? i : mi), 0);
  const showValue = (i: number) => (labelAll ? data[i].value > 0 : i === maxIdx || i === n - 1);

  const gridLines = Array.from({ length: GRID + 1 }, (_, g) => {
    const v = (niceMax / GRID) * g;
    return { v, y: yFor(v) };
  });

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xLine(i)} ${yFor(d.value)}`)
    .join(" ");
  const areaPath = `${linePath} L ${xLine(n - 1)} ${BASELINE} L ${xLine(0)} ${BASELINE} Z`;

  return (
    <ChartHoverLayer>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Time series chart"
        className="block h-auto w-full overflow-visible"
        style={{ fontFamily: "var(--font-mono)" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Gridlines + y labels */}
        {gridLines.map((g) => (
          <g key={g.v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={g.y}
              y2={g.y}
              stroke="var(--hairline)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={g.y + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--fg-subtle)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {Math.round(g.v)}
            </text>
          </g>
        ))}

        {variant === "area" ? (
          <>
            <path d={areaPath} fill="var(--accent)" fillOpacity={0.1} />
            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {data.map((d, i) => (
              <g key={`${d.key}-${i}`}>
                <circle
                  cx={xLine(i)}
                  cy={yFor(d.value)}
                  r={d.value > 0 ? 3 : 0}
                  fill="var(--accent)"
                  stroke="var(--bg)"
                  strokeWidth={2}
                  data-tl={d.label}
                  data-tv={`${d.value}${valueSuffix}`}
                >
                  <title>{`${d.label}: ${d.value}`}</title>
                </circle>
                {/* Invisible wider hit target so the hover tooltip is easy to catch. */}
                <circle
                  cx={xLine(i)}
                  cy={yFor(d.value)}
                  r={10}
                  fill="transparent"
                  data-tl={d.label}
                  data-tv={`${d.value}${valueSuffix}`}
                />
                {showValue(i) ? (
                  <text
                    x={xLine(i)}
                    y={yFor(d.value) - 9}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--fg)"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {d.value}
                    {valueSuffix}
                  </text>
                ) : null}
              </g>
            ))}
          </>
        ) : (
          <>
            {data.map((d, i) => {
              const barW = Math.max(band * 0.58, 3);
              const x = xBand(i) + (band - barW) / 2;
              const y = yFor(d.value);
              return (
                <g key={`${d.key}-${i}`}>
                  <rect
                    className="grow-y"
                    x={x}
                    y={d.value > 0 ? y : BASELINE - 1}
                    width={barW}
                    height={d.value > 0 ? BASELINE - y : 1}
                    rx={Math.min(4, barW / 2)}
                    fill="var(--accent)"
                    data-tl={d.label}
                    data-tv={`${d.value}${valueSuffix}`}
                  >
                    <title>{`${d.label}: ${d.value}${valueSuffix}`}</title>
                  </rect>
                  {/* Full-height invisible hit target for easy hovering. */}
                  <rect
                    x={xBand(i)}
                    y={PAD.top}
                    width={band}
                    height={BASELINE - PAD.top}
                    fill="transparent"
                    data-tl={d.label}
                    data-tv={`${d.value}${valueSuffix}`}
                  />
                  {showValue(i) ? (
                    <text
                      x={x + barW / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--fg)"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {d.value}
                      {valueSuffix}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </>
        )}

        {/* X axis labels (long category names truncated; full name is in the bar's title) */}
        {data.map((d, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text
              key={`x-${d.key}-${i}`}
              x={variant === "bar" ? xBand(i) + band / 2 : xLine(i)}
              y={H - 10}
              textAnchor="middle"
              fontSize={10}
              fill="var(--fg-subtle)"
            >
              {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
              <title>{d.label}</title>
            </text>
          ) : null,
        )}
      </svg>
    </ChartHoverLayer>
  );
}
