// Client-safe (no "server-only"): the browser progress UI and the server
// writer both import this so they agree on the completion threshold.

/** Position ≥ this share of an item's duration counts as watched. */
export const COMPLETE_AT_RATIO = 0.95;
