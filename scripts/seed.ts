import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { normalizeEmail } from "../lib/identity";

// Idempotent seed: the super admin from env. Run with `npm run db:seed`.
// (Standalone client: scripts run outside Next, so lib/db.ts's server-only
// guard doesn't apply here.)

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const name = process.env.SUPER_ADMIN_NAME ?? "Super Admin";
  if (!email) {
    throw new Error("SUPER_ADMIN_EMAIL is required to seed (see .env.example)");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 2 });
  const db = new PrismaClient({ adapter });

  const admin = await db.admin.upsert({
    where: { email: normalizeEmail(email) },
    update: { isSuperAdmin: true, status: "active" },
    create: {
      email: normalizeEmail(email),
      name,
      isSuperAdmin: true,
      status: "active",
    },
  });

  console.log(`Seeded super admin ${admin.email} (id ${admin.id})`);

  // JET exam row (M5-S1). update: {} on purpose — re-seeding must never
  // clobber settings an admin has since changed; defaults apply only when
  // the row is first created.
  const jet = await db.exam.upsert({
    where: { slug: "jet" },
    update: {},
    create: {
      slug: "jet",
      name: "JET Exam",
      status: "active",
      questionsPerQuiz: 20,
      timeLimitMinutes: 30,
      levels: ["basic", "medium", "hard"],
    },
  });
  console.log(`Seeded exam ${jet.slug} (id ${jet.id})`);

  await db.$disconnect();
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
