/**
 * World perf gate — measures renderer.info and scene-traversal counts for each
 * quality tier on the running dev server.
 *
 * Usage:
 *   npm run dev -- --port 5199   (in another shell)
 *   node --experimental-strip-types scripts/measure-world.ts [--url http://localhost:5199]
 *
 * Prints one JSON line per tier. The dev-only `__worldRenderer`/`__worldScene`
 * hooks in WorldCanvas.tsx make this possible; they do not exist in builds.
 */
import { chromium, type Page } from '@playwright/test';

const urlArg = process.argv.indexOf('--url');
const URL = urlArg >= 0 ? process.argv[urlArg + 1]! : 'http://localhost:5199';
// Research Session Mode is default-on and gates the start button behind a
// consent screen — opt out exactly like e2e does (harness.withoutResearch).
const url = URL.includes('research=') ? URL : `${URL}${URL.includes('?') ? '&' : '?'}research=0`;

/**
 * BUDGET = pass/fail ceilings (unchanged since the graphics pass).
 *
 * Current observed baseline (P0 repair, 2026-10-10 — three full runs on main,
 * dev server + SwiftShader, identical across runs in this headless env):
 *   low:    calls 116 · triangles 5238  · objects 260 · materials 50 · geometries 24 · textures 1
 *   medium: calls 262 · triangles 8480  · objects 493 · materials 60 · geometries 30 · textures 1
 *   high:   calls 368 · triangles 11092 · objects 648 · materials 64 · geometries 35 · textures 1
 * These are sampled maxima, not mathematical upper bounds — ambient critter
 * positions vary between environments and frustum culling follows them.
 * (Previous comments said 76/203/296 calls and docs/QA.md said 86/227/326 —
 * both predate the area/delight/critter/challenge-zone growth; the three-run
 * reproduction above replaces them.)
 *
 * Ceiling policy (P0): calls/objects get observed-max + ~15% rounded to 5 —
 * they are the position-dependent metrics; triangles get observed ×1.5
 * (still far below the old 20k/60k/80k slack); geometries observed + ~50%;
 * materials observed + ~15%; textures keep the tiny legacy bound of 4.
 * Do not raise a ceiling to fit a feature; simplify geometry first.
 */
const BUDGET: Record<string, WorldMetrics> = {
  low: { calls: 135, triangles: 8000, geometries: 40, textures: 4, objects: 300, materials: 60 },
  medium: {
    calls: 305,
    triangles: 13000,
    geometries: 50,
    textures: 4,
    objects: 570,
    materials: 70,
  },
  high: { calls: 425, triangles: 17000, geometries: 55, textures: 4, objects: 750, materials: 75 },
};

interface WorldMetrics {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly objects: number;
  readonly materials: number;
}

interface ThreeishWindow extends Window {
  __worldRenderer?: {
    render: (scene: unknown, camera: unknown) => void;
    info: {
      render: { calls: number; triangles: number };
      memory: { geometries: number; textures: number };
    };
  };
  __worldScene?: { traverse: (cb: (o: { material?: unknown }) => void) => void };
  __worldCamera?: unknown;
}

async function setTier(page: Page, tier: string) {
  await page.getByTestId('pause-button').click();
  await page.getByTestId('parent-entry-pause').click();
  const hold = page.getByTestId('parent-gate-hold');
  const box = await hold.boundingBox();
  if (!box) throw new Error('parent-gate-hold has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
  await page.mouse.up();
  await page.getByTestId(`quality-${tier}`).click();
  // Closing the parent area returns straight to the hub (resumeMode), not the
  // pause menu — there is no resume-button step.
  await page.getByTestId('parent-close').click();
  await page.getByTestId('hud').waitFor();
  await page.getByTestId('world-canvas').waitFor();
}

async function measure(page: Page): Promise<WorldMetrics | null> {
  return page.evaluate(() => {
    const w = window as unknown as ThreeishWindow;
    const gl = w.__worldRenderer;
    const scene = w.__worldScene;
    const camera = w.__worldCamera;
    if (!gl || !scene || camera === undefined) return null;
    gl.render(scene, camera); // one explicit frame so info.* reflects it
    let objects = 0;
    const materials = new Set<string>();
    scene.traverse((o) => {
      objects += 1;
      const m = o.material;
      if (m) {
        for (const item of Array.isArray(m) ? m : [m]) {
          materials.add((item as { uuid: string }).uuid);
        }
      }
    });
    return {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      objects,
      materials: materials.size,
    };
  });
}

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
await page.goto(url);
await page.getByTestId('start-button').click();
await page.getByTestId('avatar-aban').click();
await page.getByTestId('headwear-next').click();
await page.getByTestId('hud').waitFor();
await page.getByTestId('world-canvas').waitFor();

function maxMetrics(a: WorldMetrics, b: WorldMetrics): WorldMetrics {
  return {
    calls: Math.max(a.calls, b.calls),
    triangles: Math.max(a.triangles, b.triangles),
    geometries: Math.max(a.geometries, b.geometries),
    textures: Math.max(a.textures, b.textures),
    objects: Math.max(a.objects, b.objects),
    materials: Math.max(a.materials, b.materials),
  };
}

const SAMPLES_PER_TIER = 3;

let failed = false;
for (const tier of ['low', 'medium', 'high']) {
  await setTier(page, tier);
  // let the remounted canvas settle and render
  await page.waitForTimeout(400);
  // Multiple samples: ambient critters change position between them, and
  // frustum culling makes calls/triangles position-dependent — the bound must
  // hold for the worst observed frame, not a lucky one.
  let metrics: WorldMetrics | null = null;
  for (let i = 0; i < SAMPLES_PER_TIER; i++) {
    const sample = await measure(page);
    if (sample === null) {
      metrics = null;
      break;
    }
    metrics = metrics === null ? sample : maxMetrics(metrics, sample);
    if (i + 1 < SAMPLES_PER_TIER) await page.waitForTimeout(1500);
    if (sample !== null) {
      console.log(
        `    sample ${i + 1}: calls=${sample.calls} tri=${sample.triangles} geo=${sample.geometries} tex=${sample.textures} obj=${sample.objects} mat=${sample.materials}`,
      );
    }
  }
  console.log(JSON.stringify({ tier, ...metrics }));
  if (!metrics) {
    failed = true;
    continue;
  }
  const budget = BUDGET[tier]!;
  for (const key of Object.keys(budget) as (keyof WorldMetrics)[]) {
    if (metrics[key] > budget[key]) {
      console.error(`OVER BUDGET ${tier}.${key}: ${metrics[key]} > ${budget[key]}`);
      failed = true;
    }
  }
}

await browser.close();
if (failed) process.exit(1);
