// Shared bound for admin free-text search (security + performance).
//
// Search terms arrive from the URL (?q=…) and land in an ILIKE '%term%'.
// Uncapped, a very long pattern is a cheap way to force expensive matching on
// every row. 100 chars is far beyond any real name/email/code search, so the
// cap is invisible to admins and closes the amplification.
export const MAX_SEARCH_CHARS = 100;
