// Login right panel, rev 3 — a different idea per the owner: instead of an
// abstract field, a floating preview of what SkillSpark actually is (a course
// card, a JET score, a streak) composed in depth on a calm teal field with a
// gentle float. Engaging because it shows real value; the concept shows
// literally (mono score = ledger precision, teal = spark). Pure CSS, no JS —
// light for the mobile floor. Rendered on desktop only (hidden on phones).

function Play() {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/92 shadow-lg">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 3.5v9l7-4.5-7-4.5Z" fill="#0f766e" />
      </svg>
    </span>
  );
}

function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 0c.7 8 4 11.3 12 12-8 .7-11.3 4-12 12-.7-8-4-11.3-12-12 8-.7 11.3-4 12-12Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LoginShowcase() {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "linear-gradient(150deg, #0e433f 0%, #0b302f 54%, #071f28 100%)" }}
    >
      {/* soft brand glow behind the cluster */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(56% 52% at 60% 40%, rgba(45,212,191,0.22) 0%, transparent 70%)",
        }}
      />

      {/* floating product cluster */}
      <div className="absolute inset-0 grid place-items-center p-10">
        <div className="relative h-[380px] w-[380px]">
          {/* Course card — the LMS */}
          <div className="showfloat showfloat-a absolute left-0 top-6 w-[298px]">
            <div
              className="showtilt w-full rounded-lg bg-white p-3 shadow-[0_30px_60px_-20px_rgba(2,20,20,0.55)]"
              style={{ ["--rot" as string]: "-4deg" }}
            >
              <div
                className="relative grid aspect-[16/9] place-items-center overflow-hidden rounded-xl"
                style={{ background: "linear-gradient(135deg, #0f766e, #0b3a38)" }}
              >
                <Play />
                <span className="absolute bottom-2 right-2 rounded bg-black/35 px-1.5 py-0.5 font-mono text-[11px] text-white/90">
                  12:04
                </span>
              </div>
              <div className="px-1 pb-1 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">
                  Course
                </p>
                <p className="mt-1 text-[15px] font-semibold leading-tight text-slate-900">
                  Financial Accounting
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">Module 2 · Journal Entries</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[52%] rounded-full bg-teal-600" />
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-slate-400">6 / 12 lessons</p>
              </div>
            </div>
          </div>

          {/* Score card — the JET exam */}
          <div className="showfloat showfloat-b absolute right-0 top-[176px] w-[186px]">
            <div
              className="showtilt w-full rounded-lg bg-white p-4 shadow-[0_26px_50px_-18px_rgba(2,20,20,0.5)]"
              style={{ ["--rot" as string]: "5deg" }}
            >
              <div className="flex items-center gap-1.5">
                <Spark className="h-3.5 w-3.5 text-teal-500" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">
                  JET Exam
                </p>
              </div>
              <p className="mt-2 font-mono text-[2.6rem] font-medium leading-none tracking-tight text-slate-900">
                92<span className="text-slate-400">%</span>
              </p>
              <span className="mt-3 inline-flex rounded-full bg-teal-600/12 px-2.5 py-1 text-[11px] font-medium text-teal-700">
                Excellent
              </span>
            </div>
          </div>

          {/* Streak chip — the accent */}
          <div className="showfloat showfloat-c absolute bottom-3 left-10">
            <div
              className="showtilt inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 shadow-[0_18px_36px_-14px_rgba(2,20,20,0.5)]"
              style={{ ["--rot" as string]: "-2deg" }}
            >
              <Spark className="h-4 w-4 text-teal-500" />
              <span className="text-[12px] font-medium text-slate-700">
                <span className="font-mono">12</span>-day streak
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* Outer element: fades in, then floats by TRANSLATE ONLY. Pure
           vertical translation of a compositor layer never resamples the
           texture, so no edge fringe. The rotation lives on the inner
           element and is baked into the paint (crisp geometry AA). */
        .showfloat {
          animation: showFadeIn 700ms var(--ease-out-standard) both, showFloat 8s ease-in-out infinite;
        }
        .showfloat-b { animation-delay: 120ms, 1.4s; }
        .showfloat-c { animation-delay: 240ms, 0.6s; }
        /* Inner element: static tilt, painted once — edges stay sharp. */
        .showtilt { transform: rotate(var(--rot)); }
        @keyframes showFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes showFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .showfloat {
            animation: showFadeIn 700ms var(--ease-out-standard) both;
          }
        }
      `}</style>
    </div>
  );
}
