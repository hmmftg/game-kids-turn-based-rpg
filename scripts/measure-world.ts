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

/**
 * Baseline (captured on the pre-detail scene, identical across tiers):
 *   calls 58 · triangles 1152 · geometries 16 · textures 0 · objects 81 · materials 25
 *
 * Maximum acceptable overhead for the visual detail pass. The low tier keeps
 * the current scene almost untouched; medium/high may add cheap decorative
 * geometry, but draw calls stay bounded — each extra call must be a visible
 * detail, not overhead.
 */
const BUDGET: Record<string, WorldMetrics> = {
  low: { calls: 80, triangles: 20000, geometries: 40, textures: 4, objects: 120, materials: 60 },
  medium: {
    calls: 220,
    triangles: 60000,
    geometries: 60,
    textures: 4,
    objects: 400,
    materials: 80,
  },
  high: { calls: 300, triangles: 80000, geometries: 60, textures: 4, objects: 500, materials: 80 },
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
await page.goto(URL);
await page.getByTestId('start-button').click();
await page.getByTestId('avatar-aban').click();
await page.getByTestId('headwear-next').click();
await page.getByTestId('badge-0').click();
await page.getByTestId('hud').waitFor();
await page.getByTestId('world-canvas').waitFor();

let failed = false;
for (const tier of ['low', 'medium', 'high']) {
  await setTier(page, tier);
  // let the remounted canvas settle and render
  await page.waitForTimeout(400);
  const metrics = await measure(page);
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
