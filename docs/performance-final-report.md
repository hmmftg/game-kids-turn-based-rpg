# Framework/performance program — final report

Acceptance record for the mission "Optimize Runtime Performance and Evolve the
Game into a Reusable Framework" (PRs #77–#85, stages P0–P5 of the frozen plan;
this document is P6).

## Limitations — read first

- **Real-device (weak-Android) performance is UNVERIFIED.** Every number in
  this report and in `performance-baseline.md` was measured on
  `dev-server/headless-Chromium (SwiftShader)` — a software rasterizer. These
  are **repeatable regression baselines**, valid for detecting relative change,
  not proof of mobile GPU/RAM behavior.
- GPU duration is **unavailable**: no honest measurement source exists in this
  stack. `submitMs` is CPU-side render submission only and is reported
  separately from application/update work; "main-thread work" is claimed only
  where instrumentation covers it.
- JS heap numbers are quantized by headless Chromium (~bucket granularity);
  flat readings mean "no growth above the bucket size", not byte-exact
  stability.
- No battery claims anywhere.

## Before / after (same procedure, same environment label)

Active frame intervals (ms) between consecutive rendered frames; idle gaps
excluded per the metric contract. These are the **historical P2 measurements**
(PR #80, 2026-10-10 runs on the pre/post-P2 code, three-tier names; raw
artifacts: `docs/performance-baseline.raw.json` for the before run). Tier
crosswalk to the current five-tier scale: `low` → `very-low`, `medium` →
`low`, `high` → `normal`. Current `high` and `very-high` are newer detail
levels with **no historical frame-time baseline** — they are not renames.

| Current tier | Window                | Avg before → after | p95 before → after |
| ------------ | --------------------- | ------------------ | ------------------ |
| very-low     | walk                  | 24.5 → 20.6        | 35.8 → 27.1        |
| low          | walk                  | 30.5 → 25.5        | 46.0 → 34.7        |
| normal       | walk                  | 35.6 → 26.2        | 49.9 → 36.7        |
| normal       | encounter-consequence | 30.7 → 24.0        | 42.8 → 31.6        |

Change attributed to P2: **~15–25% lower active frame intervals** on the
walk window at every measured tier (Hub static-scenery memoization — React
reconciliation work removed, scene content unchanged).

A separate **current five-tier re-baseline** (2026-10-11, merged P0–P5 code)
lives in `docs/performance-baseline.md` with raw capture
`docs/performance-after.raw.json` — it is a current-state measurement, not a
P2-attribution table. JS heap flat in all runs. Draw calls unchanged by P2.

## What each stage delivered

| PR  | Stage | Delivered                                                                                                                                                                 |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #77 | P0    | Repaired `measure-world` (stale ceilings → evidence-based re-baseline + margin policy, gate proven to still fail) and `qa-screenshots` (`badge-0` removal, probe-driven). |
| #78 | P1    | `?perfprobe=1` (zero disabled cost, post-submission `gl.info` sampling, longtask + idle-gap classification) + `scripts/measure-perf.ts` + committed baseline.             |
| #80 | P2    | One measured optimization: Hub scenery memoization → the intervals above. Other candidates deferred — insufficient baseline evidence.                                     |
| #82 | P3    | `src/framework/` boundary: core primitives, `createGameRuntime`, persistence contract, `three/` camera math, battle module; lint-enforced `index.ts`.                     |
| #84 | P4    | Game migrated onto `createGameRuntime`; `ProfileCoordinator` + `SaveCoordinator` own all persistence; `PersistedState` untouched.                                         |
| #85 | P5    | `examples/hello-world` second consumer (DOM-only), disposal + critter-timer lifecycle probes, bundle/precache exclusion asserted from built output, `framework-api.md`.   |

## Mission items — complete vs incomplete

**Complete**

- Objective B (reusable framework): lint-enforced `index.ts` boundary, runtime
  adapter contract implemented per the frozen spec, independently runnable
  second consumer validating the API, API reference + walkthrough docs. Export
  audit in `framework-api.md`: every export is game-consumed, example-proven,
  or the documented public surface of the optional battle module — the API
  remains **internal and provisional**, not a published stable package.
- Instrumentation: every metric labeled, demand-loop-aware, idle never
  reported as FPS, environment labeled per run.
- Baseline + before/after: real measured numbers with stated environment and
  limitations — no fabricated metrics.
- Lifecycle correctness: probe-counted dispose events across remounts,
  `useCritters` zero pending timers at unmount, JS-heap labeled heap.
- Constraints held: Three.js/R3F/React/Vite kept; gameplay, saves,
  offline/PWA, Persian/RTL, accessibility, touch unchanged — proven by the
  existing suites, not asserted. **Save-schema history, stated accurately:**
  the program itself (P0–P5) changed no `PersistedState` field or version —
  P4's runtime migration preserved the then-current schema. The **concurrently
  merged** quality-tier evolution (PR #83) did ship a justified schema
  v2 → v3 migration (`migrateQualityTier` maps old tier ids by detail level)
  because quality-tier _identifiers_ changed — versioned-save and migration
  behavior stays covered by existing tests. Claiming "no schema change
  anywhere in the programme window" would be inaccurate; claiming the runtime
  migration touched persistence would be equally inaccurate.

**Incomplete / deferred**

- Real-device performance verification (needs physical weak-Android hardware;
  out of scope of this environment).
- Bottlenecks measured but not worked: ~1 long task per `map-transition-in`,
  consequence-scene render stretch, post-tier-switch render settle — all
  documented in `performance-baseline.md` for future evidence-driven work.
- Engine migration proposal: **none** — the evidence does not justify one.

## Verification record (P6 acceptance run, 2026-10-11)

- `npm run verify`: **green** (format, lint, typecheck, 381 unit tests, build +
  budgets + deploy shape, `validate:content`, `example:build`).
- `scripts/measure-world.ts`: **3 consecutive green runs** across all five
  tiers on this branch; sampled maxima match `docs/QA.md` exactly
  (very-low 116/260/5,238 → very-high 591/909/22,536 calls/obj/tri).
- `scripts/measure-perf.ts`: re-run → `docs/performance-after.raw.json`.
- `npx playwright test`: **236 tests, 0 failures, 11 skipped — fully green**,
  serial, both projects. Every previously documented flake passed
  (`liveliness.spec.ts:124`, `slice.spec.ts:69/84`, `routines.spec.ts:260`);
  they remain listed in `docs/QA.md` as real intermittent races, not retired.
- Precache/bundle: `check-deploy` inside `verify` re-asserts `perfProbe` and
  `examples/hello-world` absent from `dist/` and `sw.js` on the final build.
- Historical runs: stage PRs each ran `verify` + the full suite; the four
  flake failures seen across P3–P5 were reproduced on `origin/main`
  (worktree-built main, identical 1-fail/2-pass signature).

## Next steps (evidence-gated)

1. Physical low-end-Android run of `measure-perf` against a preview build —
   the only way to turn the regression baseline into device claims.
2. If a real consumer/second team emerges: evaluate the `packages/` workspace
   split _inside_ the existing `index.ts` boundary (no import-site changes).
3. Re-measure before touching the remaining bottlenecks — same
   measure-then-optimize order as this program.
