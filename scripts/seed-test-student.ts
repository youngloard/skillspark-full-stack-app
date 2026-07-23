import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { normalizeEmail } from "../lib/identity";

// Idempotent DEMO seed for the M4-S1 dashboard checkpoint. Registers a test
// student (default: the owner's second Google account), grants sample courses
// + the JET exam via a demo batch, and leaves one lesson in progress so
// continue-learning shows. Re-runnable. Clean up later:
//   delete the student by email, the "TEST-DEMO" batch, and the demo courses.

const STUDENT_EMAIL = process.argv[2] ?? "anandhuvimalan4@gmail.com";

// A real Drive video the owner shared for review, readable by the service
// account (verified 2026-07-17: video/mp4, 190s). The demo lessons point at
// it so the streaming proxy / resume can actually be exercised end-to-end.
const DEMO_DRIVE_FILE_ID = "1xnaMvgpuT3axpzwXtXVIWt6kRxLfoeaF";
const DEMO_DURATION_SECONDS = 190;

const COURSES = [
  {
    name: "Financial Accounting Fundamentals",
    description:
      "Journals, ledgers, the trial balance, and the full accounting cycle from scratch.",
    layout: "module",
  },
  {
    name: "Cost & Management Accounting",
    description: "Costing methods, budgeting, and the numbers behind management decisions.",
    layout: "module",
  },
  {
    name: "Corporate Accounting",
    description: "Company accounts, share capital, and preparing final financial statements.",
    layout: "flat",
  },
] as const;

async function main() {
  const email = normalizeEmail(STUDENT_EMAIL);
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL, max: 2 });
  const db = new PrismaClient({ adapter });
  const now = Date.now();

  const student = await db.student.upsert({
    where: { email },
    update: {
      status: "active",
      accessStartDate: new Date(now - 86_400_000),
      accessEndDate: new Date(now + 365 * 86_400_000),
    },
    create: {
      name: "Anandhu (demo student)",
      email,
      status: "active",
      accessStartDate: new Date(now - 86_400_000),
      accessEndDate: new Date(now + 365 * 86_400_000),
    },
  });

  const courses = [];
  for (const c of COURSES) {
    courses.push(
      await db.course.upsert({
        where: { name: c.name },
        update: { description: c.description, status: "active" },
        create: { name: c.name, description: c.description, layout: c.layout },
      }),
    );
  }

  // Several modules with many lessons in the first course, so the watch
  // sidebar is long enough to exercise its internal scroll. Every lesson
  // points at the real demo video.
  const fin = courses[0]!;
  const MODULES: { title: string; lessons: string[] }[] = [
    {
      title: "Journal Entries",
      lessons: [
        "Recording Your First Transaction",
        "The Double-Entry Rule",
        "Debits and Credits in Practice",
        "Compound Journal Entries",
        "Opening and Closing Entries",
        "Correcting Errors",
      ],
    },
    {
      title: "The Ledger & Trial Balance",
      lessons: [
        "Posting to the Ledger",
        "Balancing Ledger Accounts",
        "Preparing the Trial Balance",
        "Locating Trial-Balance Errors",
        "The Suspense Account",
      ],
    },
    {
      title: "Financial Statements",
      lessons: [
        "The Income Statement",
        "The Balance Sheet",
        "Adjusting Entries",
        "Accruals and Prepayments",
        "Depreciation Basics",
        "From Trial Balance to Final Accounts",
      ],
    },
  ];

  const lessonData = {
    driveFileId: DEMO_DRIVE_FILE_ID,
    duration: DEMO_DURATION_SECONDS,
    status: "active",
  };

  let lesson1: { id: string } | null = null;
  for (let mi = 0; mi < MODULES.length; mi++) {
    const spec = MODULES[mi]!;
    const existingMod = await db.module.findFirst({
      where: { courseId: fin.id, title: spec.title },
    });
    const mod = existingMod
      ? await db.module.update({ where: { id: existingMod.id }, data: { moduleOrder: mi } })
      : await db.module.create({
          data: { courseId: fin.id, title: spec.title, moduleOrder: mi },
        });

    for (let li = 0; li < spec.lessons.length; li++) {
      const title = spec.lessons[li]!;
      const data = { ...lessonData, itemOrder: li };
      const existing = await db.contentItem.findFirst({ where: { moduleId: mod.id, title } });
      const lesson = existing
        ? await db.contentItem.update({ where: { id: existing.id }, data })
        : await db.contentItem.create({
            data: { type: "video", title, moduleId: mod.id, ...data },
          });
      if (mi === 0 && li === 0) lesson1 = lesson;
    }
  }

  // A materials module so the M4-S4 viewer is reviewable: a Drive-embed
  // material (in-app /preview) and an external link-out. The upload / signed-URL
  // path is covered by the material-view tests.
  const matMod =
    (await db.module.findFirst({ where: { courseId: fin.id, title: "Course Materials" } })) ??
    (await db.module.create({
      data: { courseId: fin.id, title: "Course Materials", moduleOrder: MODULES.length },
    }));
  async function ensureMaterial(
    title: string,
    order: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    const full = { itemOrder: order, status: "active", ...data };
    const existing = await db.contentItem.findFirst({ where: { moduleId: matMod.id, title } });
    if (existing) {
      await db.contentItem.update({ where: { id: existing.id }, data: full });
    } else {
      await db.contentItem.create({
        data: { type: "material", title, moduleId: matMod.id, ...full },
      });
    }
  }
  await ensureMaterial("Worked example (recording)", 0, {
    sourceType: "drive",
    driveFileId: DEMO_DRIVE_FILE_ID,
    downloadEnabled: false,
  });
  await ensureMaterial("Reference — IFRS foundation", 1, {
    sourceType: "url",
    externalUrl: "https://www.ifrs.org/",
  });

  // Multiple notes attached to lesson 1 (a video can have many). These join any
  // uploaded note already attached; they show together in its watch-page panel.
  if (lesson1) {
    const noteParent = lesson1.id;
    async function ensureNote(title: string, order: number, data: Record<string, unknown>) {
      const full = { itemOrder: order, status: "active", ...data };
      const ex = await db.contentItem.findFirst({ where: { parentItemId: noteParent, title } });
      if (ex) await db.contentItem.update({ where: { id: ex.id }, data: full });
      else
        await db.contentItem.create({
          data: { type: "material", title, parentItemId: noteParent, ...full },
        });
    }
    await ensureNote("Summary sheet (link)", 1, {
      sourceType: "url",
      externalUrl: "https://www.ifrs.org/",
    });
    await ensureNote("Worked solution (Drive)", 2, {
      sourceType: "drive",
      driveFileId: DEMO_DRIVE_FILE_ID,
      downloadEnabled: true,
    });
  }

  // Demo batch + grants (courses + JET exam).
  const batch = await db.batch.upsert({
    where: { batchCode: "TEST-DEMO" },
    update: {},
    create: { batchCode: "TEST-DEMO", batchName: "Demo Batch" },
  });
  await db.studentBatch.upsert({
    where: { studentId_batchId: { studentId: student.id, batchId: batch.id } },
    update: {},
    create: { studentId: student.id, batchId: batch.id },
  });
  for (const course of courses) {
    await db.batchCourse.upsert({
      where: { batchId_courseId: { batchId: batch.id, courseId: course.id } },
      update: {},
      create: { batchId: batch.id, courseId: course.id },
    });
  }
  const jet = await db.exam.findUniqueOrThrow({ where: { slug: "jet" } });
  await db.batchExam.upsert({
    where: { batchId_examId: { batchId: batch.id, examId: jet.id } },
    update: {},
    create: { batchId: batch.id, examId: jet.id },
  });

  // A small demo JET question bank (basic level) so the exam UI is playable.
  // Real question workbooks are imported at M7; these are just for review.
  const JET_QUESTIONS = [
    {
      no: "d1",
      prompt: "The business buys office equipment for 50,000 and pays in cash. Record the entry.",
      options: ["Cash", "Office Equipment", "Bank", "Capital", "Purchases"],
      rows: [
        { account: "Office Equipment", debit: 50000, credit: null },
        { account: "Cash", debit: null, credit: 50000 },
      ],
    },
    {
      no: "d2",
      prompt: "Received 20,000 in cash from a credit customer (debtor). Record the entry.",
      options: ["Cash", "Debtors", "Sales", "Bank", "Capital"],
      rows: [
        { account: "Cash", debit: 20000, credit: null },
        { account: "Debtors", debit: null, credit: 20000 },
      ],
    },
    {
      no: "d3",
      prompt: "The owner introduces 100,000 capital into the business bank account.",
      options: ["Bank", "Capital", "Cash", "Drawings", "Loan"],
      rows: [
        { account: "Bank", debit: 100000, credit: null },
        { account: "Capital", debit: null, credit: 100000 },
      ],
    },
    {
      no: "d4",
      prompt: "Goods are sold for 15,000 on credit to a customer. Record the sale.",
      options: ["Debtors", "Sales", "Cash", "Purchases", "Bank"],
      rows: [
        { account: "Debtors", debit: 15000, credit: null },
        { account: "Sales", debit: null, credit: 15000 },
      ],
    },
    {
      no: "d5",
      prompt: "Paid 8,000 rent for the month by cheque (bank). Record the entry.",
      options: ["Rent", "Bank", "Cash", "Capital", "Expenses"],
      rows: [
        { account: "Rent", debit: 8000, credit: null },
        { account: "Bank", debit: null, credit: 8000 },
      ],
    },
    {
      no: "d6",
      prompt: "Purchased goods for 12,000 in cash. Record the purchase.",
      options: ["Purchases", "Cash", "Bank", "Sales", "Creditors"],
      rows: [
        { account: "Purchases", debit: 12000, credit: null },
        { account: "Cash", debit: null, credit: 12000 },
      ],
    },
  ];
  for (const q of JET_QUESTIONS) {
    const exists = await db.question.findFirst({
      where: { examId: jet.id, level: "basic", sourceQuestionNo: q.no },
    });
    if (exists) continue;
    await db.question.create({
      data: {
        examId: jet.id,
        level: "basic",
        sourceQuestionNo: q.no,
        prompt: q.prompt,
        sheetName: "Demo",
        options: {
          create: q.options.map((optionText, optionIndex) => ({ optionIndex, optionText })),
        },
        answerRows: {
          create: q.rows.map((r, rowIndex) => ({
            rowIndex,
            account: r.account,
            debit: r.debit,
            credit: r.credit,
          })),
        },
      },
    });
  }

  // Continue-learning: leave lesson 1 partway through (well under the 95%
  // completion threshold, so it stays "in progress" and resume is visible).
  const resumeAt = 45;
  if (lesson1) {
    await db.videoProgress.upsert({
      where: { studentId_itemId: { studentId: student.id, itemId: lesson1.id } },
      update: { positionSeconds: resumeAt, completed: false },
      create: {
        studentId: student.id,
        itemId: lesson1.id,
        positionSeconds: resumeAt,
        completed: false,
      },
    });
  }

  const lessonCount = MODULES.reduce((n, m) => n + m.lessons.length, 0);
  console.log(`Demo student ready: ${student.email}`);
  console.log(
    `  ${courses.length} courses + JET exam granted; ${MODULES.length} modules / ${lessonCount} lessons; 1 lesson in progress.`,
  );
  console.log(`  Sign in at http://localhost:3000/login with that Google account.`);
  await db.$disconnect();
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
