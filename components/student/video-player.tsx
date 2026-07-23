"use client";

import { useEffect, useRef } from "react";

// The watch player (M4-S3). A native <video> fed by the authorized streaming
// proxy — which is what makes resume/autosave/completion possible at all
// (docs/DECISIONS.md 2026-07-17). It never sees a driveFileId, only this URL.
//
// Saves: throttled during playback, immediately on pause/seek/end, and via
// sendBeacon on unload/hide. All posts are fire-and-forget — a dropped save is
// never surfaced to the student.

/** Perf Δ: never autosave more often than this during playback. */
const SAVE_INTERVAL_MS = 15_000;
/** Don't write unless the position actually moved this much. */
const MIN_DELTA_SECONDS = 5;

type PostOpts = { ended?: boolean; watchedDelta?: number };

function post(itemId: string, positionSeconds: number, opts: PostOpts = {}) {
  void fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId,
      positionSeconds,
      ...(opts.ended ? { ended: true } : {}),
      ...(opts.watchedDelta ? { watchedDelta: opts.watchedDelta } : {}),
    }),
    keepalive: true,
  }).catch(() => {
    /* best-effort */
  });
}

function beacon(itemId: string, positionSeconds: number, watchedDelta?: number) {
  const payload = JSON.stringify({
    itemId,
    positionSeconds,
    ...(watchedDelta ? { watchedDelta } : {}),
  });
  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon("/api/progress", blob)) return;
  } catch {
    /* fall through to fetch */
  }
  post(itemId, positionSeconds, { watchedDelta });
}

export function VideoPlayer({
  itemId,
  initialPosition,
  onReport,
}: {
  itemId: string;
  initialPosition: number;
  /** Live position/completion callback (drives the sidebar's progress UI). */
  onReport?: (positionSeconds: number, ended?: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // Keep the latest callback without re-running the listener effect below.
  const reportRef = useRef(onReport);
  useEffect(() => {
    reportRef.current = onReport;
  }, [onReport]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    let lastSavedAt = 0;
    let lastSavedTs = -1;
    let didSeek = false;
    // Watch-time accumulation: sum of forward playback deltas (seeks excluded),
    // so watchSeconds measures content actually played, not the last position.
    let watchedAccum = 0;
    let prevTime = -1;
    /** Whole seconds watched since the last send; keeps the fractional remainder. */
    const takeWatched = () => {
      const w = Math.floor(watchedAccum);
      watchedAccum -= w;
      return w;
    };

    const now = () => Date.now();
    const currentSeconds = () => {
      const t = Math.floor(v.currentTime);
      return Number.isFinite(t) && t >= 0 ? t : null;
    };

    const flush = (final: boolean, ended?: boolean) => {
      const t = currentSeconds();
      if (t === null) return;
      // Throttle only the playback ticks; pause/seek/end always write.
      if (
        !final &&
        (now() - lastSavedAt < SAVE_INTERVAL_MS || Math.abs(t - lastSavedTs) < MIN_DELTA_SECONDS)
      ) {
        return;
      }
      lastSavedTs = t;
      lastSavedAt = now();
      post(itemId, t, { ended, watchedDelta: takeWatched() });
    };

    // Resume: seek once, clamped just shy of the end so a finished video
    // doesn't reopen already-ended.
    const onLoadedMetadata = () => {
      if (didSeek) return;
      didSeek = true;
      if (initialPosition <= 0) return;
      const max = Number.isFinite(v.duration) && v.duration > 0 ? v.duration - 2 : initialPosition;
      const target = Math.min(initialPosition, Math.max(0, max));
      try {
        v.currentTime = target;
      } catch {
        /* seeking can throw before metadata on some browsers */
      }
      reportRef.current?.(Math.floor(target));
    };

    const onTimeUpdate = () => {
      // Count only small forward advances as watch time (a seek jumps or goes
      // backward → not "watched"). ~0.25s ticks during normal playback.
      const raw = v.currentTime;
      if (Number.isFinite(raw)) {
        if (prevTime >= 0 && !v.paused) {
          const d = raw - prevTime;
          if (d > 0 && d <= 1.5) watchedAccum += d;
        }
        prevTime = raw;
      }
      const t = currentSeconds();
      if (t !== null) reportRef.current?.(t); // live UI (cheap; the store dedups)
      flush(false); // server (throttled)
    };
    const onPause = () => flush(true);
    const onSeeked = () => {
      prevTime = v.currentTime; // don't count the jump as watch time
      const t = currentSeconds();
      if (t !== null) reportRef.current?.(t);
      flush(true);
    };
    const onEnded = () => {
      reportRef.current?.(currentSeconds() ?? 0, true);
      flush(true, true);
    };
    const onVisibility = () => {
      if (!document.hidden) return;
      const t = currentSeconds();
      if (t !== null) beacon(itemId, t, takeWatched());
    };
    const onPageHide = () => {
      const t = currentSeconds();
      if (t !== null) beacon(itemId, t, takeWatched());
    };

    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    if (v.readyState >= 1 /* HAVE_METADATA */) onLoadedMetadata();

    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      // Leaving the lesson (client nav counts) — save where they got to.
      const t = currentSeconds();
      if (t !== null) beacon(itemId, t, takeWatched());
    };
  }, [itemId, initialPosition]);

  return (
    <video
      ref={ref}
      // The proxy URL — the Drive id never reaches the browser.
      src={`/api/videos/${itemId}/stream`}
      controls
      preload="metadata"
      // No download affordance (PRD FR-2.6 — honest access control, not DRM).
      controlsList="nodownload"
      className="h-full w-full bg-black"
    />
  );
}
