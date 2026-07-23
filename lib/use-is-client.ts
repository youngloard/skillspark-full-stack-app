import { useSyncExternalStore } from "react";

// SSR-safe "are we on the client yet?" gate for portal targets (document.body
// only exists client-side). useSyncExternalStore renders the server snapshot
// (false) during SSR + hydration, then syncs to true — no hydration mismatch
// and no setState-in-effect (the project's lint forbids the useEffect variant;
// same technique as theme-toggle.tsx).

const noopSubscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
