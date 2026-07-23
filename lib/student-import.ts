// CSV parsing for the bulk student import (M6). Client-safe (no server imports)
// so the upload UI can parse + preview before sending rows to the server.
//
// Columns (owner's format): 1 email · 2 "<CODE…> <Name>" (e.g. "KLM 2606 1282
// Seethal U" → code "KLM 2606 1282", name "Seethal U") · 3 batch name (opt) ·
// 4 course name(s) (opt). Cols 3/4 create the batch/courses if new and link
// them. A batch may hold SEVERAL courses, so column 4 accepts a list separated
// by "+" (or ";"), e.g. "Tally Prime + Tally VAT".

export type ParsedRow = {
  email: string;
  code: string;
  name: string;
  batchName: string | null;
  /** Zero or more course names — column 4 may list several, split on + or ;. */
  courseNames: string[];
  error: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split "KLM 2606 1282 Seethal U" → code = the leading all-caps/number run,
 *  name = from the first token containing a lowercase letter. */
export function splitCodeAndName(raw: string): { code: string; name: string } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { code: "", name: "" };
  const firstNameIdx = tokens.findIndex((t) => /[a-z]/.test(t));
  if (firstNameIdx <= 0) return { code: "", name: raw.trim() }; // no code prefix
  return {
    code: tokens.slice(0, firstNameIdx).join(" "),
    name: tokens.slice(firstNameIdx).join(" "),
  };
}

/** Minimal CSV line splitter (handles double-quoted fields with commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseImportCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Drop a header row if the first cell isn't an email.
  const firstCells = splitCsvLine(lines[0]);
  const start = EMAIL_RE.test(firstCells[0] ?? "") ? 0 : 1;

  const rows: ParsedRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const email = (cells[0] ?? "").toLowerCase();
    const { code, name } = splitCodeAndName(cells[1] ?? "");
    const batchName = cells[2]?.trim() || null;
    const courseNames = (cells[3] ?? "")
      .split(/[+;]/)
      .map((c) => c.trim())
      .filter(Boolean);

    let error: string | null = null;
    if (!EMAIL_RE.test(email)) error = "Invalid or missing email";
    else if (!name) error = "Missing student name";

    rows.push({ email, code, name, batchName, courseNames, error });
  }
  return rows;
}
