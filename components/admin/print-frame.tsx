import { Logo } from "@/components/brand/logo";
import { PrintButton } from "@/components/admin/print-button";

// Shared frame for the print/PDF reports (M6-S2/S3). Forces a white palette
// regardless of app theme — a report is always white paper — by overriding the
// role tokens on the wrapper (they cascade to every child utility). Used by the
// dashboard report and the per-student report.

const LIGHT_TOKENS: React.CSSProperties & Record<string, string> = {
  "--bg": "#ffffff",
  "--surface": "#ffffff",
  "--surface-2": "#f1f5f9",
  "--line": "rgba(15,23,42,0.08)",
  "--hairline": "rgba(15,23,42,0.06)",
  "--fg": "#0f172a",
  "--fg-muted": "#475569",
  "--fg-subtle": "#64748b",
  "--accent": "#0f766e",
  "--accent-hover": "#0d9488",
  "--accent-fg": "#ffffff",
  "--focus": "#12a594",
  "--color-spark": "#1abc9c",
  colorScheme: "light",
  background: "#ffffff",
  color: "#0f172a",
};

export function PrintFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div style={LIGHT_TOKENS} className="min-h-svh bg-white">
      <div className="mx-auto w-full max-w-5xl px-8 py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <Logo className="w-[132px] text-fg" />
          <PrintButton />
        </div>

        <header className="border-t border-line pt-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
        </header>

        <div className="mt-8">{children}</div>

        <p className="mt-12 border-t border-hairline pt-4 text-xs text-fg-subtle">
          SkillSpark — internal report. Figures reflect data at generation time.
        </p>
      </div>
    </div>
  );
}
