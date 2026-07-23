import "dotenv/config";
import { readFileSync } from "node:fs";
import { Client } from "pg";

// One-off migration: legacy Railway data -> Supabase.
//
// Reads a LOCAL pg_dump snapshot of the old database — the Railway server is
// never contacted, so it cannot be altered (owner's requirement: it stays as
// his archive).
//
// Scope (owner's decisions):
//   * wipes students / batches / courses / content only
//   * KEEPS the exam definitions (exams, questions, options, answer rows)
//   * imports old watch progress
// Row ids are preserved verbatim, so foreign keys map 1:1 and a re-run is
// idempotent (every insert is ON CONFLICT DO NOTHING).
//
// Usage: npx tsx scripts/migrate-from-railway.ts <dump.sql> [--commit]
// Without --commit it rolls back at the end: a full dry run that reports the
// exact numbers without changing anything.

const NULL = "\\N";

type Row = Record<string, string | null>;

/** Parse one COPY block out of the dump. Empty tables yield []. */
function readTable(sql: string, table: string): Row[] {
  const header = `COPY public."${table}" (`;
  const start = sql.indexOf(header);
  if (start === -1) return [];
  const colsEnd = sql.indexOf(") FROM stdin;\n", start);
  const cols = sql
    .slice(start + header.length, colsEnd)
    .split(",")
    .map((c) => c.trim().replace(/"/g, ""));
  const bodyStart = colsEnd + ") FROM stdin;\n".length;
  const bodyEnd = sql.indexOf("\n\\.\n", bodyStart - 1);
  const body = sql.slice(bodyStart, bodyEnd === -1 ? bodyStart : bodyEnd);
  if (!body.trim()) return [];
  return body
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const vals = line.split("\t");
      const row: Row = {};
      cols.forEach((c, i) => {
        const v = vals[i];
        // Postgres COPY escapes; the only ones this data actually contains.
        row[c] =
          v === undefined || v === NULL
            ? null
            : v
                .replace(/\\n/g, "\n")
                .replace(/\\t/g, "\t")
                .replace(/\\r/g, "\r")
                .replace(/\\\\/g, "\\");
      });
      return row;
    });
}

const ts = (v: string | null) => (v ? new Date(v.replace(" ", "T") + "Z") : null);

async function main() {
  const dumpPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!dumpPath)
    throw new Error("usage: tsx scripts/migrate-from-railway.ts <dump.sql> [--commit]");

  const sql = readFileSync(dumpPath, "utf8");
  const courses = readTable(sql, "Course");
  const batches = readTable(sql, "Batch");
  const students = readTable(sql, "Student");
  const batchCourses = readTable(sql, "BatchCourse");
  const studentBatches = readTable(sql, "StudentBatch");
  const videos = readTable(sql, "Video");
  const progress = readTable(sql, "VideoProgress");

  console.log("Snapshot read (Railway untouched):");
  console.log(
    `  courses=${courses.length} batches=${batches.length} students=${students.length}` +
      ` batchCourses=${batchCourses.length} studentBatches=${studentBatches.length}` +
      ` videos=${videos.length} progress=${progress.length}`,
  );
  if (!courses.length || !students.length) throw new Error("snapshot looks empty — aborting");

  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  await db.query("BEGIN");

  try {
    // ---- 1. Clear the current roster/catalogue. Exam DEFINITIONS survive.
    // attempts/quiz_sessions/student_exams hang off students, so they go with
    // them — but exams, questions, options and answer rows are untouched.
    const wipe = [
      "video_progress",
      "material_downloads",
      "content_items",
      "modules",
      "batch_courses",
      "batch_exams",
      "student_batches",
      "student_exams",
      "quiz_sessions",
      "attempts",
      "students",
      "batches",
      "courses",
    ];
    for (const t of wipe) {
      const r = await db.query(`DELETE FROM "${t}"`);
      console.log(`  cleared ${t.padEnd(20)} ${r.rowCount}`);
    }

    // ---- 2. Import, parents first so foreign keys always resolve.
    let n = 0;

    for (const c of courses) {
      await db.query(
        `INSERT INTO courses (id,name,description,image_url,status,layout,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [
          c.id,
          c.name,
          c.description,
          c.imageUrl,
          c.status,
          c.layout,
          ts(c.createdAt),
          ts(c.updatedAt),
        ],
      );
      n++;
    }
    console.log(`  + courses          ${n}`);

    n = 0;
    for (const b of batches) {
      await db.query(
        `INSERT INTO batches (id,batch_code,batch_name,description,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [b.id, b.batchCode, b.batchName, b.description, ts(b.createdAt), ts(b.updatedAt)],
      );
      n++;
    }
    console.log(`  + batches          ${n}`);

    n = 0;
    for (const s of students) {
      await db.query(
        `INSERT INTO students
           (id,student_code,name,email,status,access_start_date,access_end_date,
            last_login_at,last_emailed_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
        [
          s.id,
          s.studentCode,
          s.name,
          (s.email ?? "").trim().toLowerCase(), // our identity rule: email is normalized
          s.status,
          ts(s.accessStartDate),
          ts(s.accessEndDate),
          ts(s.lastLoginAt),
          ts(s.lastEmailedAt),
          ts(s.createdAt),
          ts(s.updatedAt),
        ],
      );
      n++;
    }
    console.log(`  + students         ${n}`);

    n = 0;
    for (const bc of batchCourses) {
      await db.query(
        `INSERT INTO batch_courses (id,batch_id,course_id,assigned_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [bc.id, bc.batchId, bc.courseId, ts(bc.assignedAt)],
      );
      n++;
    }
    console.log(`  + batch_courses    ${n}`);

    n = 0;
    for (const sb of studentBatches) {
      await db.query(
        `INSERT INTO student_batches (id,student_id,batch_id,assigned_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [sb.id, sb.studentId, sb.batchId, ts(sb.assignedAt)],
      );
      n++;
    }
    console.log(`  + student_batches  ${n}`);

    // Video -> ContentItem(type="video"). Every legacy video hangs off a course
    // directly (flat layout), which our content model supports natively.
    n = 0;
    for (const v of videos) {
      await db.query(
        `INSERT INTO content_items
           (id,type,module_id,course_id,title,description,item_order,status,
            drive_file_id,duration,duration_fetched_at,download_enabled,created_at,updated_at)
         VALUES ($1,'video',$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
        [
          v.id,
          v.moduleId,
          v.courseId,
          v.title,
          v.description,
          Number(v.videoOrder ?? 0),
          v.status,
          v.driveFileId,
          v.duration === null ? null : Number(v.duration),
          ts(v.durationFetchedAt),
          ts(v.createdAt),
          ts(v.updatedAt),
        ],
      );
      n++;
    }
    console.log(`  + content_items    ${n}`);

    // Watch history. The legacy schema has no watch-seconds counter, so it
    // starts at 0: "completed" carries over, cumulative watch-time analytics
    // begin from today rather than inventing numbers.
    n = 0;
    let skipped = 0;
    const videoIds = new Set(videos.map((v) => v.id));
    const studentIds = new Set(students.map((s) => s.id));
    for (const p of progress) {
      if (!videoIds.has(p.videoId ?? "") || !studentIds.has(p.studentId ?? "")) {
        skipped++;
        continue;
      }
      await db.query(
        `INSERT INTO video_progress
           (id,student_id,item_id,position_seconds,watch_seconds,completed,created_at,updated_at)
         VALUES ($1,$2,$3,$4,0,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [
          p.id,
          p.studentId,
          p.videoId,
          Number(p.lastTimestamp ?? 0),
          p.completed === "t",
          ts(p.createdAt),
          ts(p.updatedAt),
        ],
      );
      n++;
    }
    console.log(`  + video_progress   ${n}${skipped ? ` (${skipped} orphans skipped)` : ""}`);

    // ---- 3. Verify against the live tables before deciding to keep it.
    const counts = await db.query(`
      SELECT 'students' t, count(*)::int c FROM students
      UNION ALL SELECT 'batches', count(*) FROM batches
      UNION ALL SELECT 'courses', count(*) FROM courses
      UNION ALL SELECT 'batch_courses', count(*) FROM batch_courses
      UNION ALL SELECT 'student_batches', count(*) FROM student_batches
      UNION ALL SELECT 'content_items', count(*) FROM content_items
      UNION ALL SELECT 'video_progress', count(*) FROM video_progress
      UNION ALL SELECT 'exams (kept)', count(*) FROM exams
      UNION ALL SELECT 'questions (kept)', count(*) FROM questions
      UNION ALL SELECT 'admins (kept)', count(*) FROM admins`);
    console.log("\nResulting table counts:");
    for (const r of counts.rows) console.log(`  ${String(r.t).padEnd(20)} ${r.c}`);

    if (commit) {
      await db.query("COMMIT");
      console.log("\nCOMMITTED.");
    } else {
      await db.query("ROLLBACK");
      console.log("\nDRY RUN — rolled back. Re-run with --commit to apply.");
    }
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
