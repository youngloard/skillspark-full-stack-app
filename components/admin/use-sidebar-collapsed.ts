import { useCallback, useSyncExternalStore } from "react";

// Persisted collapse state for the desktop admin rail. Same external-store
// pattern as theme-toggle.tsx: the value lives in localStorage, is read as an
// external store (no setState-in-effect, SSR-safe via the server snapshot), and
// a custom event notifies every subscriber in the tab when it flips.

const KEY = "skillspark-admin-nav-collapsed";
const EVENT = "skillspark-admin-nav-change";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false; // rail starts expanded until the client reads the stored choice
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    const next = !collapsed;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // storage unavailable (private mode) — the in-session flip still fires below
    }
    window.dispatchEvent(new Event(EVENT));
  }, [collapsed]);
  return [collapsed, toggle];
}
