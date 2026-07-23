import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

// Standalone client: scripts run outside Next, so lib/db.ts's server-only guard
// doesn't apply here (same pattern as scripts/seed.ts).
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 2 });
const db = new PrismaClient({ adapter });

// Demo analytics data (M6-S2) so the admin dashboard charts are populated for
// review. Idempotent + deterministic (seeded RNG). Creates a tagged cohort of
// students spread across the last ~12 months and a spread of exam attempts.
//
// CLEAN UP BEFORE RELEASE: delete students whose email contains
// "analytics-demo", the "ANALYTICS-DEMO" batch, the "Analytics Demo Course",
// and their attempts (cascade from the students).

const STUDENT_COUNT = 48;
const MONTHS_BACK = 12;
const LEVELS = ["basic", "medium", "hard"] as const;

// Deterministic LCG so re-runs produce the same demo (no churn).
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function labelFor(pct: number): string {
  if (pct < 0.4) return "Poor";
  if (pct < 0.7) return "Good";
  if (pct < 0.9) return "Very Good";
  return "Excellent";
}

async function main() {
  const rng = makeRng(20260718);
  const now = new Date();

  const jet = await db.exam.findUnique({ where: { slug: "jet" } });
  if (!jet) throw new Error("Run `npm run db:seed` first (JET exam missing).");

  const course = await db.course.upsert({
    where: { name: "Analytics Demo Course" },
    update: {},
    create: { name: "Analytics Demo Course", description: "Demo cohort for dashboard analytics." },
  });
  const batch = await db.batch.upsert({
    where: { batchCode: "ANALYTICS-DEMO" },
    update: {},
    create: { batchCode: "ANALYTICS-DEMO", batchName: "Analytics Demo Cohort" },
  });
  await db.batchCourse.upsert({
    where: { batchId_courseId: { batchId: batch.id, courseId: course.id } },
    update: {},
    create: { batchId: batch.id, courseId: course.id },
  });
  await db.batchExam.upsert({
    where: { batchId_examId: { batchId: batch.id, examId: jet.id } },
    update: {},
    create: { batchId: batch.id, examId: jet.id },
  });

  let attemptCount = 0;
  const studentIds: string[] = [];
  for (let i = 0; i < STUDENT_COUNT; i++) {
    // Enrolment date: spread across the last MONTHS_BACK months.
    const monthsAgo = Math.floor(rng() * MONTHS_BACK);
    const createdAt = new Date(now);
    createdAt.setUTCMonth(createdAt.getUTCMonth() - monthsAgo);
    createdAt.setUTCDate(1 + Math.floor(rng() * 26));

    const email = `analytics-demo-${i}@skillspark.test`;
    const student = await db.student.upsert({
      where: { email },
      update: {},
      create: {
        name: `Demo Student ${i + 1}`,
        email,
        createdAt,
        accessStartDate: createdAt,
        accessEndDate: new Date(now.getTime() + 365 * 86_400_000),
        lastLoginAt: rng() > 0.3 ? now : null,
      },
    });
    await db.studentBatch.upsert({
      where: { studentId_batchId: { studentId: student.id, batchId: batch.id } },
      update: {},
      create: { studentId: student.id, batchId: batch.id },
    });
    studentIds.push(student.id);

    // 0–4 attempts per student, dated between enrolment and now.
    const attempts = Math.floor(rng() * 5);
    for (let k = 0; k < attempts; k++) {
      const quizId = `adem-${i}-${k}`;
      const existing = await db.attempt.findUnique({ where: { quizId } });
      if (existing) {
        attemptCount++;
        continue;
      }
      const spanMs = Math.max(now.getTime() - createdAt.getTime(), 86_400_000);
      const completedAt = new Date(createdAt.getTime() + rng() * spanMs);
      const level = LEVELS[Math.floor(rng() * LEVELS.length)];
      const pct = Math.round((0.25 + rng() * 0.7) * 100) / 100; // 0.25–0.95
      const total = 20;
      await db.attempt.create({
        data: {
          quizId,
          studentId: student.id,
          examId: jet.id,
          level,
          score: Math.round(pct * total),
          totalQuestions: total,
          percentage: pct,
          performanceLabel: labelFor(pct),
          completedAt,
          resultsJson: {},
        },
      });
      attemptCount++;
    }
  }

  // --- Content + watch time + downloads (so every Phase 3 chart populates) ---
  const DEFAULT_DURATION = 600;

  // Grant the demo cohort access to every course, so watch/download data shows
  // up whatever course filter is applied (not just the demo course).
  const allCourses = await db.course.findMany({ select: { id: true } });
  for (const c of allCourses) {
    await db.batchCourse.upsert({
      where: { batchId_courseId: { batchId: batch.id, courseId: c.id } },
      update: {},
      create: { batchId: batch.id, courseId: c.id },
    });
  }

  // Make sure the demo course has its own content (in case no other exists).
  for (let o = 0; o < 3; o++) {
    const title = `Demo Lesson ${o + 1}`;
    const found = await db.contentItem.findFirst({ where: { title, courseId: course.id } });
    if (!found) {
      await db.contentItem.create({
        data: {
          type: "video",
          title,
          courseId: course.id,
          itemOrder: o,
          driveFileId: `demo-video-${o}`,
          duration: DEFAULT_DURATION,
        },
      });
    }
  }
  const demoNotes = await db.contentItem.findFirst({
    where: { title: "Demo Notes", courseId: course.id },
  });
  if (!demoNotes) {
    await db.contentItem.create({
      data: {
        type: "material",
        title: "Demo Notes",
        courseId: course.id,
        itemOrder: 3,
        sourceType: "url",
        externalUrl: "https://example.com/demo-notes.pdf",
        downloadEnabled: true,
      },
    });
  }

  // Watch progress across ALL videos (mix of fully-watched / skipped / in-progress).
  const videos = await db.contentItem.findMany({
    where: { type: "video" },
    select: { id: true, duration: true },
  });
  const progressRows: {
    studentId: string;
    itemId: string;
    watchSeconds: number;
    positionSeconds: number;
    completed: boolean;
  }[] = [];
  for (const sid of studentIds) {
    for (const v of videos) {
      if (rng() < 0.5) continue; // each student watches ~half the catalogue
      const dur = v.duration && v.duration > 0 ? v.duration : DEFAULT_DURATION;
      const roll = rng();
      let watchSeconds: number;
      let completed: boolean;
      if (roll < 0.5) {
        watchSeconds = Math.round(dur * (0.9 + rng() * 0.1)); // fully watched
        completed = true;
      } else if (roll < 0.75) {
        watchSeconds = Math.round(dur * (0.2 + rng() * 0.3)); // skipped to end
        completed = true;
      } else {
        watchSeconds = Math.round(dur * (0.1 + rng() * 0.5)); // in progress
        completed = false;
      }
      progressRows.push({
        studentId: sid,
        itemId: v.id,
        watchSeconds,
        positionSeconds: watchSeconds,
        completed,
      });
    }
  }
  // createMany skips rows that already exist (unique studentId+itemId), so re-runs are safe.
  const progress = await db.videoProgress.createMany({ data: progressRows, skipDuplicates: true });

  // Downloads across ALL downloadable materials. Reset the demo cohort's
  // downloads first so re-runs re-populate (no natural unique key to dedupe on).
  await db.materialDownload.deleteMany({ where: { studentId: { in: studentIds } } });
  const materials = await db.contentItem.findMany({
    where: { type: "material", downloadEnabled: true },
    select: { id: true },
  });
  let downloadCount = 0;
  if (materials.length > 0) {
    const downloadRows: { itemId: string; studentId: string; createdAt: Date }[] = [];
    for (const sid of studentIds) {
      for (const m of materials) {
        const n = Math.floor(rng() * 3); // 0–2 downloads of each material
        for (let d = 0; d < n; d++) {
          downloadRows.push({
            itemId: m.id,
            studentId: sid,
            createdAt: new Date(now.getTime() - Math.floor(rng() * 300) * 86_400_000),
          });
        }
      }
    }
    const dl = await db.materialDownload.createMany({ data: downloadRows });
    downloadCount = dl.count;
  }

  console.log(
    `Analytics demo seeded: ${STUDENT_COUNT} students, ${attemptCount} attempts, ${progress.count} watch rows, ${downloadCount} downloads across ${allCourses.length} courses.`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
