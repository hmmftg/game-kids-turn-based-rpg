/**
 * Perf probe — loaded ONLY via a runtime-conditional dynamic `import()`
 * behind `?perfprobe=1` (see main.tsx), so the disabled path costs zero
 * bytes parsed. Exposes `__perf` / `__perfSnapshot` on window for the
 * scripted measurement harness (scripts/measure-perf.ts).
 *
 * Honest-metric contract (docs/performance-baseline.md records it too):
 * - Frame interval = time between consecutive *rendered* frames, taken from
 *   the renderer's own frame completion timestamps — never a wall-clock
 *   sampling loop. `frameloop="demand"` means idle gaps between renders are
 *   intentional and are classified separately, never reported as FPS.
 * - Sampling point: `WebGLRenderer.prototype.render` is wrapped so
 *   `gl.info.render` is read AFTER that frame's submission — a `useFrame`
 *   callback would read the *preceding* frame's counters.
 * - `submitMs` is CPU-side JS + render-submission time — not GPU duration.
 * - `performance.memory` is the JS heap — labeled heap, never GPU memory.
 */
interface FrameSample {
  /** performance.now() at the moment this frame's render() returned. */
  t: number;
  /** CPU time inside renderer.render() (submission, not GPU work). */
  submitMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

interface Mark {
  name: string;
  t: number;
  /** JS heap (usedJSHeapSize), null where performance.memory is absent. */
  heapBytes: number | null;
}

interface WindowSpan {
  name: string;
  t0: number;
  t1: number | null;
}

interface LongTaskSample {
  t: number;
  duration: number;
}

interface PerfWindowReport {
  name: string;
  t0: number;
  t1: number | null;
  frames: number;
  /** Intervals between consecutive rendered frames fully inside the window. */
  activeIntervals: { count: number; avgMs: number | null; p95Ms: number | null };
  /**
   * Intervals longer than IDLE_GAP_MS — intentional demand-loop idle inside
   * an active scenario. Reported separately, never averaged into p95.
   */
  idleGaps: { count: number; totalMs: number };
  calls: { avg: number | null; max: number | null };
  triangles: { avg: number | null; max: number | null };
  submitMs: { avg: number | null; p95: number | null };
  longtasks: { count: number; totalMs: number };
}

/** Intervals above this are classified as demand-loop idle, not slow frames. */
const IDLE_GAP_MS = 100;

const frames: FrameSample[] = [];
const marks: Mark[] = [];
const spans: WindowSpan[] = [];
const longtasks: LongTaskSample[] = [];
let installed = false;

function heapBytes(): number | null {
  const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? mem.usedJSHeapSize : null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

function avg(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function windowReport(span: WindowSpan): PerfWindowReport {
  const end = span.t1 ?? performance.now();
  const inside = frames.filter((f) => f.t >= span.t0 && f.t <= end);
  const intervals: number[] = [];
  let idleGapTotal = 0;
  let idleGapCount = 0;
  for (let i = 1; i < inside.length; i += 1) {
    const dt = inside[i]!.t - inside[i - 1]!.t;
    if (dt > IDLE_GAP_MS) {
      idleGapCount += 1;
      idleGapTotal += dt;
    } else {
      intervals.push(dt);
    }
  }
  const active = intervals.slice().sort((a, b) => a - b);
  const submits = inside.map((f) => f.submitMs).sort((a, b) => a - b);
  const tasks = longtasks.filter((l) => l.t >= span.t0 && l.t <= end);
  return {
    name: span.name,
    t0: span.t0,
    t1: span.t1,
    frames: inside.length,
    activeIntervals: {
      count: active.length,
      avgMs: avg(active),
      p95Ms: percentile(active, 95),
    },
    idleGaps: { count: idleGapCount, totalMs: idleGapTotal },
    calls: {
      avg: avg(inside.map((f) => f.calls)),
      max: inside.length ? Math.max(...inside.map((f) => f.calls)) : null,
    },
    triangles: {
      avg: avg(inside.map((f) => f.triangles)),
      max: inside.length ? Math.max(...inside.map((f) => f.triangles)) : null,
    },
    submitMs: { avg: avg(submits), p95: percentile(submits, 95) },
    longtasks: {
      count: tasks.length,
      totalMs: tasks.reduce((a, l) => a + l.duration, 0),
    },
  };
}

function snapshot() {
  return {
    marks: marks.slice(),
    windows: spans.map(windowReport),
    longtasks: longtasks.slice(),
    frames: frames.slice(),
    heapBytes: heapBytes(),
  };
}

export function installPerfProbe(): void {
  if (installed) return;
  installed = true;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longtasks.push({ t: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // longtask unsupported — the snapshot just reports zero tasks.
  }

  // Post-submission sample point: wrap the live renderer instance (exposed
  // by WorldCanvas as __worldRenderer) so each renderer.render() call — the
  // demand loop's actual frames — records one entry with gl.info read after
  // return; inside useFrame the same counters would describe the *previous*
  // frame. The instance is patched (not the prototype) so the measurement
  // never depends on module identity between the app and this chunk.
  let patched: { render: (scene: unknown, camera: unknown) => void } | null = null;
  const patchRenderer = () => {
    // Poll forever: WorldCanvas remounts (parent area, pause, tier change)
    // replace __worldRenderer with a fresh instance that must be re-wrapped.
    requestAnimationFrame(patchRenderer);
    const w = window as unknown as {
      __worldRenderer?: {
        render: (scene: unknown, camera: unknown) => void;
        info: {
          render: { calls: number; triangles: number };
          memory: { geometries: number; textures: number };
        };
      };
    };
    const renderer = w.__worldRenderer;
    if (!renderer || renderer === patched) return;
    patched = renderer;
    const original = renderer.render.bind(renderer);
    renderer.render = (scene: unknown, camera: unknown) => {
      const t0 = performance.now();
      original(scene, camera);
      const t1 = performance.now();
      const info = renderer.info;
      frames.push({
        t: t1,
        submitMs: t1 - t0,
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      });
    };
  };
  requestAnimationFrame(patchRenderer);

  const w = window as unknown as Record<string, unknown>;
  w['__perf'] = {
    mark(name: string) {
      marks.push({ name, t: performance.now(), heapBytes: heapBytes() });
    },
    /** Opens a named continuous-rendering window; `end()` closes the newest open one. */
    begin(name: string) {
      spans.push({ name, t0: performance.now(), t1: null });
    },
    end() {
      for (let i = spans.length - 1; i >= 0; i -= 1) {
        if (spans[i]!.t1 === null) {
          spans[i]!.t1 = performance.now();
          return;
        }
      }
    },
    snapshot,
  };
  w['__perfSnapshot'] = snapshot;
  marks.push({ name: 'perfprobe:installed', t: performance.now(), heapBytes: heapBytes() });
}
