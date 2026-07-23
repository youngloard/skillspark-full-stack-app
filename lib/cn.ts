// Minimal class-name joiner (clsx-lite). Kept dependency-free; if class
// conflicts become a real problem, revisit tailwind-merge then.
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
