"use client";

import { useRef, useState } from "react";

// A thin client overlay that turns the charts' native SVG <title> tips into a
// styled, on-brand tooltip. The chart SVG (a server component) is passed as
// children; each hoverable mark carries data-tl (label) and data-tv (value).
// Event delegation keeps it to a single listener regardless of mark count.

type Tip = { x: number; y: number; label: string; value: string };

export function ChartHoverLayer({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const onMove = (e: React.PointerEvent) => {
    const mark = (e.target as Element).closest<SVGElement>("[data-tl]");
    const box = ref.current;
    if (!mark || !box) {
      if (tip) setTip(null);
      return;
    }
    const rect = box.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setTip({
      x: Math.max(60, Math.min(x, rect.width - 60)),
      y: e.clientY - rect.top,
      label: mark.getAttribute("data-tl") ?? "",
      value: mark.getAttribute("data-tv") ?? "",
    });
  };

  return (
    <div ref={ref} className="relative" onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
      {children}
      {tip ? (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 shadow-[0_12px_32px_-12px_rgba(2,20,20,0.55)]"
          style={{ left: tip.x, top: tip.y - 12 }}
          role="status"
        >
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            {tip.label}
          </div>
          <div className="mt-0.5 font-display text-sm font-semibold tabular-nums text-fg">
            {tip.value}
          </div>
        </div>
      ) : null}
    </div>
  );
}
