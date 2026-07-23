import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI-only config (migrations, studio). Uses the session-mode pooler URL —
// transaction mode (DATABASE_URL) can't run migrations. Runtime connection
// lives in lib/db.ts via the pg driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
