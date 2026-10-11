# Performance guide

How the game stays cheap to render, how to measure it, and the rules that keep
it that way. For measured numbers see [performance-baseline.md](performance-baseline.md);
for the profiler surface see `src/framework/core/perfProbe.ts`.

## The one rule that matters

`frameloop="demand"` is the contract: the canvas renders only when something
invalidates it. There is **no persistent animation loop**. Every animated thing
eases toward a target state and stops calling `invalidate()` when it settles.
Before optimizing anything, check that a window is actually supposed to be
rendering — idle frames near zero is correct behavior, not a stall.

Consequences:

- **Never report idle FPS.** During intentional idle the demand loop renders
  nothing; "FPS" would measure the gaps between nothing. Measure _frame
  intervals during activity_ instead.
- Any new animation must be bounded: invalidate until settled, then stop.
  `__worldAnimationStats.active === 0` after every episode is the e2e-asserted
  invariant.

## Quality tiers

Five tiers (`very-low` → `very-high`), mapped to detail levels 0–4 in
`src/world/models/qualityProfile.ts`. Geometry helpers (`sphereFor`,
`cylinderFor`, `roundedBoxFor`) return per-level cached instances; level 0
returns the original shared instances at zero cost. `detectQualityTier` never
auto-selects the top two tiers — those are parent-gated manual choices only.

- `high` = full bodies (arms/hands/fingers, feet, NPC faces, animal legs/paws)
- `very-high` = realistic clothing drapes on `female`/`covering` figures

Measured cost on the 2026-10-11 baseline run (SwiftShader, draw calls at hub
walk): `very-low` ≈ 111, `low` ≈ 215, `normal` ≈ 301, `high` ≈ 393,
`very-high` ≈ 447. DPR is capped per tier; CSS `image-rendering` and antialias
follow the tier via `capabilitiesFor`.

## Measuring: `?perfprobe=1`

The probe is a runtime-conditional dynamic `import()` in `src/main.tsx` — with
no flag, zero bytes are parsed, and the emitted `perfProbe-*.js` chunk is
excluded from the PWA precache (asserted by `scripts/check-deploy.ts`).

```bash
npm run dev -- --port 5199
node --experimental-strip-types scripts/measure-perf.ts   # full scenario, all 5 tiers
```

The script drives the real game (boot → avatar → walk → dialogue → encounter
beats → consequence → cave in/out) per tier and writes a raw JSON report plus
a console table. What it records:

- **Frame interval** — time between consecutive _rendered_ frames, sampled by
  wrapping the live `__worldRenderer.render()` so `gl.info` is read
  post-submission. Intervals >100 ms inside an active window are classified
  `idleGaps` and never averaged into avg/p95.
- **`submitMs`** — CPU-side JS + render submission inside `render()`. It is
  _not_ GPU time and _not_ all main-thread work; report it separately from
  application/update work. Only say "main-thread work" when the instrumentation
  actually covers that interval. GPU duration: **unavailable** — no honest
  measurement source in this stack.
- **`longtask`** — PerformanceObserver long tasks only.
- **`performance.memory`** — JS heap, labeled heap. Never GPU memory. Headless
  Chromium quantizes it to buckets, so small deltas are invisible.
- `gl.info.render` calls/triangles per window.

## Lifecycle probes

Fresh `gl.info` counters after a remount cannot prove disposal — the counters
reset with the renderer. Instead, `DisposalProbe` (DEV or `?`-flag
`__WORLD_PROBE`) counts real `dispose` events on scene-owned resources via
`addEventListener('dispose')` into `window.__worldDisposeEvents`; it only sees
scene-unique disposables because shared `disposal={null}` resources correctly
never fire. `useCritters` records `__worldCritterTimersAtUnmount` — pending
timers at unmount, must be 0. `e2e/memory-soak.spec.ts` asserts both sides:
counts grow across unmount/remount (release happened) and stay flat during
in-renderer updates (no leak).

## WorldCanvas remount semantics

`<Canvas key={mapId}>` remounts on every map transition — this is load-bearing
teardown, not a bug. `forceContextLoss()` fires `webglcontextlost` by design;
genuine-loss handling stays guarded by `CanvasLiveness`. The remount is
measured (`map-transition-*` windows, `__worldDisposeEvents`), never
"optimized" away.

## Budgets and gates

- `npm run build` → `scripts/check-budgets.ts` enforces bundle-size budgets;
  `scripts/check-deploy.ts` enforces deploy shape (precache contents,
  `perfProbe`/`examples` exclusion).
- `scripts/measure-world.ts` counts draw calls/objects/triangles against
  ceilings re-baselined in P0 (dev-server/headless-Chromium label, documented
  margin policy in `docs/QA.md`).
- `scripts/qa-screenshots.ts` — visual/lifecycle QA, repaired in P0.

## Asset and change guidelines

- Prefer per-tier geometry helpers over one-size meshes; high-detail extras
  belong behind tier levels 3–4, never on the default path.
- `RoundedBoxGeometry` costs ~300 tris at segments=2 — main masses only,
  never small accents.
- Keep HUD in the DOM (RTL text does not belong in WebGL); keep ambient props
  from swallowing taps (see placement/raycast rules in AGENTS.md).
- No new dependencies for presentation; no persistent listeners on the
  demand loop.

## Environment honesty

Every measured number carries an environment label
(`dev-server/headless-Chromium (SwiftShader)`, `preview+probe`, …). Numbers
from different labels are not comparable. Headless SwiftShader numbers are a
**regression baseline** — they detect relative change, they do not prove
low-end-mobile GPU/RAM performance. Real-device performance is **unverified**;
a real-device pass requires a physical weak-Android run and is listed as a
next step, not a claim.
