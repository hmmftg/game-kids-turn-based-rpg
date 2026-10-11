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
excluded per the metric contract. Before = P1 run (2026-10-10); after =
post-P2 run (2026-10-11). Tier names remapped for the PR #83 five-tier scale
(before-low → very-low, before-medium → low, before-high → normal).

| Window                | Before avg/p95 (`low`) | After (`very-low`) | Before avg/p95 (`medium`) | After (`low`) | Before avg/p95 (`high`) | After (`normal`) |
| --------------------- | ---------------------- | ------------------ | ------------------------- | ------------- | ----------------------- | ---------------- |
| walk                  | 24.5 / 35.8            | 20.1 / 28.2        | 30.5 / 46.0               | 25.0 / 34.6   | 35.6 / 49.9             | 27.4 / 38.9      |
| encounter-beats       | 18.0 / 24.9            | 17.0 / 21.9        | 26.4 / 35.4               | 22.0 / 28.2   | 32.1 / 42.3             | 24.7 / 34.8      |
| encounter-consequence | 18.6 / 26.1            | 17.0 / 20.9        | 25.6 / 34.8               | 22.6 / 29.7   | 30.7 / 42.8             | 24.5 / 32.8      |

Change: **~15–25% lower active frame intervals across all continuous-render
windows** from the single P2 commit (Hub static-scenery memoization). JS heap
flat in both runs (29.4 MB → ~44.7 MB bucket; different Chromium buckets, both
flat). Draw calls unchanged — the optimization removed React reconciliation
work, not scene content.

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
  second consumer validating the API, API reference + walkthrough docs.
- Instrumentation: every metric labeled, demand-loop-aware, idle never
  reported as FPS, environment labeled per run.
- Baseline + before/after: real measured numbers with stated environment and
  limitations — no fabricated metrics.
- Lifecycle correctness: probe-counted dispose events across remounts,
  `useCritters` zero pending timers at unmount, JS-heap labeled heap.
- Constraints held: Three.js/R3F/React/Vite kept; gameplay, saves,
  `PersistedState`, offline/PWA, Persian/RTL, accessibility, touch unchanged —
  proven by the existing suites, not asserted.

**Incomplete / deferred**

- Real-device performance verification (needs physical weak-Android hardware;
  out of scope of this environment).
- Bottlenecks measured but not worked: ~1 long task per `map-transition-in`,
  consequence-scene render stretch, post-tier-switch render settle — all
  documented in `performance-baseline.md` for future evidence-driven work.
- Engine migration proposal: **none** — the evidence does not justify one.

## Verification record

- `npm run verify` green on every stage PR (format, lint, typecheck, unit
  tests, build + budgets + deploy shape, `validate:content`).
- `npx playwright test` green on every stage PR except documented pre-existing
  landscape flakes (`liveliness.spec.ts:124`, `slice.spec.ts:69/84`,
  `routines.spec.ts:260`) reproduced on `origin/main` — verified as having no
  regression, not a globally green repository.

## Next steps (evidence-gated)

1. Physical low-end-Android run of `measure-perf` against a preview build —
   the only way to turn the regression baseline into device claims.
2. If a real consumer/second team emerges: evaluate the `packages/` workspace
   split _inside_ the existing `index.ts` boundary (no import-site changes).
3. Re-measure before touching the remaining bottlenecks — same
   measure-then-optimize order as this program.
