"use client";

import { VideoPlayer } from "@/components/student/video-player";
import { useWatchProgress } from "./progress-context";

// Bridges the generic player to the watch progress store: every position/
// completion the player reports updates the live sidebar UI (M4-S3).

export function WatchPlayer({
  itemId,
  initialPosition,
}: {
  itemId: string;
  initialPosition: number;
}) {
  const { report } = useWatchProgress();
  return (
    <VideoPlayer
      itemId={itemId}
      initialPosition={initialPosition}
      onReport={(position, ended) => report(itemId, position, ended)}
    />
  );
}
