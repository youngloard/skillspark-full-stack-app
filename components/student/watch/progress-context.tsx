"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { COMPLETE_AT_RATIO } from "@/lib/progress-shared";

// In-session progress store for the watch page (M4-S3). Seeded from the server
// and updated live by the player, so the sidebar's per-lesson state and the
// overall bar move as you watch — no reload. The server POST remains the
// source of truth on the next load; this is the live view.

export type ItemProgress = { positionSeconds: number; completed: boolean };

type WatchProgress = {
  map: Record<string, ItemProgress>;
  report: (itemId: string, positionSeconds: number, ended?: boolean) => void;
};

const Ctx = createContext<WatchProgress | null>(null);

export function WatchProgressProvider({
  initial,
  durations,
  children,
}: {
  initial: Record<string, ItemProgress>;
  durations: Record<string, number | null>;
  children: React.ReactNode;
}) {
  const [map, setMap] = useState<Record<string, ItemProgress>>(initial);

  const report = useCallback(
    (itemId: string, positionSeconds: number, ended?: boolean) => {
      const position = Math.max(0, Math.floor(positionSeconds));
      setMap((prev) => {
        const cur = prev[itemId];
        const dur = durations[itemId] ?? null;
        const reached = dur && dur > 0 ? position >= dur * COMPLETE_AT_RATIO : false;
        // Completion is sticky, mirroring the server writer.
        const completed = cur?.completed === true || ended === true || reached;
        if (cur && cur.positionSeconds === position && cur.completed === completed) return prev;
        return { ...prev, [itemId]: { positionSeconds: position, completed } };
      });
    },
    [durations],
  );

  const value = useMemo(() => ({ map, report }), [map, report]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWatchProgress(): WatchProgress {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWatchProgress must be used within WatchProgressProvider");
  return ctx;
}
