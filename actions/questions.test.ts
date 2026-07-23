import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// M5-S3 integration tests: question CRUD, superadmin bulk gating, keyset
// list + ILIKE search budget, and cache invalidation — real DB.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const actions = await import("./questions");
const { clearQuestionIdCache, getQuestionIdList } = await import("@/lib/question-cache");
const { db } = await import("@/lib/db");

const STAMP = `m5s3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let adminId: string;
let adminEmail: string;
let superId: string;
let superEmail: string;
let examId: string;

const asAdmin = () =>
  mockAuth.mockResolvedValue({ user: { role: "admin", adminId, email: adminEmail } });
const asSuper = () =>
  mockAuth.mockResolvedValue({
    user: { role: "superadmin", adminId: superId, email: superEmail },
  });

const body = (no: string, over: Record<string, unknown> = {}) => ({
  examId,
  level: "basic",
  sourceQuestionNo: no,
  prompt: `Prompt ${no} ${STAMP}`,
  options: ["Option A", "Option B"],
  answerRows: [{ account: "Cash", debit: 100.5 }],
  ...over,
});

function expectOk<T>(result: { ok: boolean }): asserts result is { ok: true; data: T } {
  expect(result).toMatchObject({ ok: true });
}

beforeAll(async () => {
  adminEmail = `admin-${STAMP}@test.skillspark.local`;
  adminId = (await db.admin.create({ data: { name: "Q Admin", email: adminEmail } })).id;
  superEmail = `super-${STAMP}@test.skillspark.local`;
  superId = (
    await db.admin.create({ data: { name: "Q Super", email: superEmail, isSuperAdmin: true } })
  ).id;
  examId = (await db.exam.create({ data: { slug: `qx-${STAMP}`, name: `QX ${STAMP}` } })).id;
});

beforeEach(() => {
  mockAuth.mockReset();
  asAdmin();
  clearQuestionIdCache();
});

afterAll(async () => {
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.auditLog.deleteMany({ where: { actorEmail: { contains: STAMP } } });
  await db.admin.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("question actions", () => {
  it("crud-audited", async () => {
    const created = await actions.createQuestion(body("c1"));
    expectOk<{ id: string }>(created);
    const id = created.data.id;

    // Children landed in order.
    const row = await db.question.findUniqueOrThrow({
      where: { id },
      include: { options: true, answerRows: true },
    });
    expect(row.options.map((o) => o.optionText)).toEqual(["Option A", "Option B"]);
    expect(row.answerRows[0]!.debit?.toString()).toBe("100.5");

    // Unknown level rejected against exam.levels.
    const badLevel = await actions.createQuestion(body("c2", { level: "expert" }));
    expect(badLevel).toMatchObject({ ok: false, error: { code: "VALIDATION" } });

    // Duplicate triple → CONFLICT with field.
    const dup = await actions.createQuestion(body("c1"));
    expect(dup).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // Update replaces children wholesale.
    const updated = await actions.updateQuestion({
      id,
      sourceQuestionNo: "c1",
      prompt: "Updated prompt",
      options: ["Only option"],
      answerRows: [],
    });
    expect(updated).toMatchObject({ ok: true });
    const after = await db.question.findUniqueOrThrow({
      where: { id },
      include: { options: true, answerRows: true },
    });
    expect(after.prompt).toBe("Updated prompt");
    expect(after.options).toHaveLength(1);
    expect(after.answerRows).toHaveLength(0);

    const deleted = await actions.deleteQuestion({ id });
    expect(deleted).toMatchObject({ ok: true });

    const audited = new Set(
      (await db.auditLog.findMany({ where: { actorEmail: adminEmail } })).map((r) => r.action),
    );
    for (const expected of ["QUESTION_CREATED", "QUESTION_UPDATED", "QUESTION_DELETED"]) {
      expect(audited, `missing ${expected}`).toContain(expected);
    }
  }, 30_000);

  it("bulk-delete-by-level", async () => {
    for (const no of ["b1", "b2"]) expectOk(await actions.createQuestion(body(no)));
    expectOk(await actions.createQuestion(body("m1", { level: "medium" })));

    // Admin may bulk-delete an explicit selection…
    const first = await actions.createQuestion(body("b3"));
    expectOk<{ id: string }>(first);
    const byIds = await actions.bulkDeleteQuestions({ examId, ids: [first.data.id] });
    expect(byIds).toMatchObject({ ok: true, data: { deleted: 1 } });

    // …but a whole level requires the super admin.
    const denied = await actions.bulkDeleteQuestions({ examId, level: "basic" });
    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    asSuper();
    const byLevel = await actions.bulkDeleteQuestions({ examId, level: "basic" });
    expect(byLevel).toMatchObject({ ok: true, data: { deleted: 2 } });
    // The other level untouched.
    expect(await db.question.count({ where: { examId, level: "medium" } })).toBe(1);

    // Audited with the selector snapshot.
    const audit = await db.auditLog.findFirst({
      where: { action: "QUESTIONS_BULK_DELETED", actorEmail: superEmail },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.oldValue).toMatchObject({ deleted: 2, selector: { level: "basic" } });

    // delete-all also superadmin-only.
    asAdmin();
    const allDenied = await actions.bulkDeleteQuestions({ examId, all: true });
    expect(allDenied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    asSuper();
    const all = await actions.bulkDeleteQuestions({ examId, all: true });
    expect(all).toMatchObject({ ok: true, data: { deleted: 1 } });
  }, 30_000);

  it("cache-invalidated-on-mutation", async () => {
    const created = await actions.createQuestion(body("k1"));
    expectOk<{ id: string }>(created);

    const firstLoad = await getQuestionIdList(examId, "basic");
    expect(firstLoad).toContain(created.data.id);
    // Hit path returns the same frozen array — allocation-free.
    const secondLoad = await getQuestionIdList(examId, "basic");
    expect(secondLoad).toBe(firstLoad);
    expect(Object.isFrozen(firstLoad)).toBe(true);

    // A mutation invalidates; the next read sees the new world.
    const second = await actions.createQuestion(body("k2"));
    expectOk<{ id: string }>(second);
    const reloaded = await getQuestionIdList(examId, "basic");
    expect(reloaded).not.toBe(firstLoad);
    expect(reloaded).toContain(second.data.id);

    // Delete invalidates too.
    await actions.deleteQuestion({ id: created.data.id });
    const afterDelete = await getQuestionIdList(examId, "basic");
    expect(afterDelete).not.toContain(created.data.id);
    await actions.deleteQuestion({ id: second.data.id });
  }, 30_000);

  it("search-ilike-under-budget and keyset pagination", { timeout: 60_000 }, async () => {
    // Seed 2k questions server-side (§5 volume class: bank ≤ low thousands).
    await db.$executeRawUnsafe(`
      INSERT INTO questions (id, exam_id, level, source_question_no, prompt, sheet_name, imported_at)
      SELECT gen_random_uuid()::text, '${examId}', 'basic', 'n-'||i,
             CASE WHEN i % 50 = 0 THEN 'Depreciation entry '||i ELSE 'Journal entry '||i END,
             'Seed', now()
      FROM generate_series(1, 2000) i`);
    await db.$executeRawUnsafe(`ANALYZE questions`);

    await db.question.createMany({
      data: [
        {
          examId,
          level: "medium",
          sourceQuestionNo: "level-medium-only",
          prompt: "Medium-only question",
          sheetName: "Search seed",
        },
        {
          examId,
          level: "hard",
          sourceQuestionNo: "level-hard-only",
          prompt: "Hard-only question",
          sheetName: "Search seed",
        },
      ],
    });

    // Search correctness.
    const found = await actions.listQuestions({ examId, search: "depreciation", limit: 100 });
    expectOk<{ items: { prompt: string }[]; nextCursor: string | null }>(found);
    expect(found.data.items.length).toBe(40);
    expect(found.data.items.every((q) => /depreciation/i.test(q.prompt))).toBe(true);

    const byNumber = await actions.listQuestions({ examId, search: "n-1999" });
    expectOk<{ items: { sourceQuestionNo: string }[] }>(byNumber);
    expect(byNumber.data.items.some((q) => q.sourceQuestionNo === "n-1999")).toBe(true);

    const byLevelTerm = await actions.listQuestions({ examId, search: "medium" });
    expectOk<{ items: { level: string }[] }>(byLevelTerm);
    expect(byLevelTerm.data.items.map((q) => q.level)).toEqual(["medium"]);

    const multiLevel = await actions.listQuestions({
      examId,
      levels: ["medium", "hard"],
      limit: 20,
    });
    expectOk<{ items: { level: string }[]; total: number }>(multiLevel);
    expect(new Set(multiLevel.data.items.map((q) => q.level))).toEqual(new Set(["medium", "hard"]));
    expect(multiLevel.data.total).toBe(2);

    const selectedLevels = await actions.selectAllQuestionIds({
      examId,
      levels: ["medium", "hard"],
    });
    expectOk<{ ids: string[]; capped: boolean }>(selectedLevels);
    expect(selectedLevels.data.ids).toHaveLength(2);
    expect(selectedLevels.data.capped).toBe(false);

    const selectedSearch = await actions.selectAllQuestionIds({
      examId,
      search: "depreciation",
    });
    expectOk<{ ids: string[]; capped: boolean }>(selectedSearch);
    expect(selectedSearch.data.ids).toHaveLength(40);
    expect(selectedSearch.data.capped).toBe(false);

    // Server-side ILIKE time within the §5 budget (<100ms).
    const plan = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN ANALYZE SELECT id FROM questions WHERE exam_id = '${examId}' AND prompt ILIKE '%depreciation%'`,
    );
    const timeLine = plan.map((r) => r["QUERY PLAN"]).find((l) => l.startsWith("Execution Time"));
    const ms = parseFloat(timeLine!.replace("Execution Time: ", ""));
    expect(ms).toBeLessThan(100);

    // Keyset walk: no duplicates, no gaps, stable order.
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await actions.listQuestions({
        examId,
        levels: ["basic"],
        cursor,
        limit: 100,
      });
      expectOk<{ items: { id: string }[]; nextCursor: string | null }>(page);
      for (const item of page.data.items) {
        expect(seen.has(item.id), "duplicate across pages").toBe(false);
        seen.add(item.id);
      }
      cursor = page.data.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 30);
    expect(seen.size).toBe(2000);

    // Bad cursor is an actionable error, not a crash.
    const bad = await actions.listQuestions({ examId, cursor: "not-a-cursor" });
    expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("question actions require admin", async () => {
    mockAuth.mockResolvedValue(null);
    const results = await Promise.all([
      actions.createQuestion(body("x")),
      actions.updateQuestion({
        id: "x",
        sourceQuestionNo: "x",
        prompt: "x",
        options: ["a"],
        answerRows: [],
      }),
      actions.deleteQuestion({ id: "x" }),
      actions.bulkDeleteQuestions({ examId, all: true }),
      actions.listQuestions({ examId }),
      actions.selectAllQuestionIds({ examId }),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
  });
});
