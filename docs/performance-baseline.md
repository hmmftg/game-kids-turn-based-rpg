# Performance baseline

P1 deliverable of the framework/performance program: a scripted, repeatable
baseline measured by `?perfprobe=1` instrumentation. Raw captured run:
`docs/performance-baseline.raw.json` (committed with this document).

## Test setup

- Environment label: **`dev-server/headless-Chromium (SwiftShader)`** —
  `npm run dev -- --port 5199`, Playwright Chromium 153.0.8010.12,
  viewport 900×500, `--enable-unsafe-swiftshader`. Software rasterizer:
  CPU-submit timings are meaningful; GPU frame cost is not representative.
- Load `http://localhost:5199/?research=0&perfprobe=1`. The probe is fetched
  via a runtime-conditional dynamic `import()` in `src/main.tsx`; without the
  flag zero bytes of it are parsed. Its chunk is excluded from the PWA
  precache manifest (`globIgnores: ['**/perfProbe-*.js']` + a `check-deploy`
  assertion on the built `sw.js`).
- Procedure per quality tier (low → medium → high): hub idle 3 s → trail-chip
  walk to an NPC → figure-tap dialogue → encounter demonstrate beats (auto-play)
  → consequence scene → leave at step 2 → cave transition in → cave transition
  out. Reproduce: `node --experimental-strip-types scripts/measure-perf.ts`.

## Metric contract

- **Frame interval** = time between consecutive _rendered_ frames, taken by
  wrapping the live `__worldRenderer` instance's `render()` so `gl.info.render`
  is read **post-submission** (a `useFrame` callback would read the _preceding_
  frame's counters). `submitMs` is CPU-side JS + submission — not GPU time.
- `frameloop="demand"` means idle gaps are intentional. Intervals over 100 ms
  inside an active window are classified as `idleGaps` and **never averaged
  into avg/p95 or reported as FPS**. A window with `frames=0` means the demand
  loop rendered nothing — correct idle behavior, not a stall.
- `performance.memory` = JS heap, labeled heap — never GPU memory.
- These numbers are a **repeatable regression baseline**, not proof of
  low-end-device GPU/RAM performance. Real-device performance is **unverified**.
- No battery claims.

## Results (2026-10-10 run; intervals in ms, "active" = frames inside window)

Startup (wall-clock, dev server — includes unbundled dev module loading):
time-to-interactive (`start-button`) ≈ **340 ms**, hub world mounted ≈ **660 ms**.
JS heap at every mark: a constant **29.4 MB** — flat across the whole scenario;
note headless Chromium may quantize `usedJSHeapSize`, so deltas below the
bucket size are invisible here.

| Tier   | Window                | Frames | Avg interval                      | p95 interval | Calls avg/max | Tris avg/max | Submit avg/p95 |
| ------ | --------------------- | ------ | --------------------------------- | ------------ | ------------- | ------------ | -------------- |
| low    | hub-idle              | 0      | — (no renders — idle demand loop) | —            | —             | —            | —              |
| low    | walk                  | 110    | 24.5                              | 35.8         | 110/120       | 4.9k/5.3k    | 0.5/0.8        |
| low    | encounter-beats       | 192    | 18.0                              | 24.9         | 87/89         | 4.3k/4.4k    | 0.4/0.5        |
| low    | encounter-consequence | 362    | 18.6                              | 26.1         | 87/87         | 4.3k         | 0.3/0.4        |
| low    | map-transition-in     | 38     | 19.3                              | 25.0         | 66/67         | 3.6k         | 0.6/0.4        |
| low    | map-transition-out    | 8      | 16.7                              | 20.9         | 67/67         | 3.6k         | 1.0/3.3        |
| medium | hub-idle¹             | 154    | 19.5                              | 29.8         | 149/149       | 5.2k         | 0.4/0.5        |
| medium | walk                  | 289    | 30.5                              | 46.0         | 205/273       | 6.9k/8.8k    | 0.6/0.8        |
| medium | encounter-beats       | 132    | 26.4                              | 35.4         | 198/204       | 7.1k/7.5k    | 0.5/0.6        |
| medium | encounter-consequence | 271    | 25.6                              | 34.8         | 198/198       | 7.1k         | 0.6/0.7        |
| medium | map-transition-out    | 8      | 30.1                              | 36.7         | 154/154       | 5.3k         | 0.6/1.4        |
| high   | hub-idle¹             | 122    | 24.7                              | 32.2         | 215/216       | 6.5k         | 0.6/0.6        |
| high   | walk                  | 251    | 35.6                              | 49.9         | 283/378       | 8.7k/11.4k   | 0.8/1.0        |
| high   | encounter-beats       | 109    | 32.1                              | 42.3         | 263/270       | 8.9k/9.3k    | 0.7/0.9        |
| high   | encounter-consequence | 228    | 30.7                              | 42.8         | 263/263       | 8.9k         | 0.9/1.1        |
| high   | map-transition-out    | 8      | 26.3                              | 32.3         | 215/215       | 6.5k         | 0.6/1.4        |

¹ The `hub-idle` window at medium/high contains the post-tier-switch re-render
settle after the Canvas remount — not steady-state idle. At low the settle had
already finished inside the 500 ms pre-window delay, so it records 0 frames.

`map-transition-in` exists only for the first cave visit (reveal rock → second
tap enters); later tiers skip the reveal so no window is recorded.

Long tasks: ~1 per scenario during `map-transition-in` (the cave remount's
first render/compile); occasional 1–2 during high-tier consequence scenes.
Heap deltas: none observable above quantization.

## Prioritized bottlenecks (evidence → P2 candidates)

1. **Continuous-rendering frame interval scales with scene draw calls.** Even
   at `low`, active intervals average 18–25 ms (>60 fps budget); at `high` walk
   averages 36 ms with p95 ≈ 50 ms and draw calls up to 378. Under SwiftShader
   this is CPU raster cost — the driver of the interval — so per-frame JS/draw
   submission work (walker/camera invalidations, per-frame object churn) is the
   first P2 candidate.
2. **Map-transition long task.** ~1 long task per transition-in; first renders
   after a map remount batch compile/setup work. Candidate: split or warm the
   first-render work across frames.
3. **Post-tier-switch render settle.** A tier change remounts the Canvas and
   renders ~120–150 frames before settling; worth confirming no redundant
   invalidations run during settle.
4. **Encounter consequence scenes render 230–360 frames** per episode — the
   single longest continuous-render stretch in the scenario; verify animation
   invalidation stops when the episode settles.

Non-findings: no heap growth across the full scenario; submit (CPU-side render
call) stays ≤ ~1 ms avg at every tier — the frame interval gap lives in the
rest of the frame, not in `render()` itself.
