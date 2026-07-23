import "server-only";
import { z } from "zod";

// Zod-validated environment. Import `env` from here — never read process.env
// directly in app code, so a missing variable fails fast at boot with a clear
// message instead of surfacing as a runtime mystery.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .startsWith("postgresql://", "DATABASE_URL must be a postgresql:// connection string"),
  DIRECT_URL: z
    .string()
    .startsWith("postgresql://", "DIRECT_URL must be a postgresql:// connection string"),
  // Auth (M1-S2)
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 chars (openssl rand -base64 32)"),
  AUTH_GOOGLE_ID: z.string().endsWith(".apps.googleusercontent.com"),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  // Google Drive (M2-S3) — optional: without either, duration fetch is skipped
  GOOGLE_DRIVE_API_KEY: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  // Supabase Storage (M2-S4) — material uploads fail actionably when unset
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  // AI (M9) — optional until that module lands
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  // Email (M8) — ZeptoMail HTTP API. Optional: without a token, sending is
  // disabled and the admin sees an actionable "email is not configured" error
  // rather than a silent no-op.
  ZEPTOMAIL_TOKEN: z.string().optional(),
  ZEPTOMAIL_API_URL: z.string().url().default("https://api.zeptomail.in/v1.1/email"),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default("SkillSpark"),
  EMAIL_PLATFORM_URL: z.string().url().default("https://videos.skillspark.study"),
});

export type Env = z.infer<typeof envSchema>;

/** Pure parser, unit-testable without touching real process.env. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment — fix .env (see .env.example): ${missing}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
