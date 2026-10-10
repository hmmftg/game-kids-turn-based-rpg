// Dev-only: per-tier close-up captures of the avatar, the elder NPC and a
// cat at identical camera pose, zoom, lighting and pose — the visual proof
// that Medium refines Low and High refines Medium at gameplay distance.
//
// Requires `npm run dev -- --port 5199` and chromium with SwiftShader.
// Usage: node --experimental-strip-types scripts/qa-tier-closeups.ts [outdir]
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = 'http://localhost:5199';
const out = process.argv[2] ?? '/tmp/tier-closeups';

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
await page.addInitScript(() => {
  (window as unknown as Record<string, unknown>)['__WORLD_PROBE'] = true;
});
await page.goto(`${base}?research=0`);
await page.getByTestId('start-button').click();
await page.getByTestId('avatar-aban').click();
await page.getByTestId('headwear-next').click();
await page.getByTestId('hud').waitFor();
await page.getByTestId('world-canvas').waitFor();
await page.waitForTimeout(800);

interface Probe {
  __worldNpcs?: Record<string, { x: number; z: number }>;
  __worldAt?: { x: number; z: number };
  __worldMoving?: boolean;
  __worldToScreen?: (x: number, z: number, y?: number) => { x: number; y: number };
  __worldCritterTransforms?: () => readonly (readonly [string, number, number, number, number])[];
}

type ProbeWindow = Window & Probe;
async function waitForWalkerIdle() {
  await page
    .waitForFunction(
      () => (window as unknown as Record<string, unknown>)['__worldMoving'] === false,
      undefined,
      { timeout: 60000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function setTier(page: Page, tier: string) {
  await page.getByTestId('pause-button').click();
  await page.getByTestId('parent-entry-pause').click();
  const hold = await page.getByTestId('parent-gate-hold').boundingBox();
  if (!hold) throw new Error('parent-gate-hold has no bounding box');
  await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
  await page.mouse.down();
  await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
  await page.mouse.up();
  await page.getByTestId(`quality-${tier}`).click();
  await page.getByTestId('parent-close').click();
  await page.getByTestId('hud').waitFor();
  await page.getByTestId('world-canvas').waitFor();
  await page.waitForTimeout(500);
}

/** Screen point of a world position, or null when off-viewport. */
async function screenPoint(x: number, z: number) {
  const p = await page.evaluate(
    ({ x: wx, z: wz }) => {
      const w = window as unknown as Probe;
      return w.__worldToScreen?.(wx, wz, 0.6) ?? null;
    },
    { x, z },
  );
  if (!p) return null;
  if (p.x < 0 || p.y < 0 || p.x > 900 || p.y > 500) return null;
  return p;
}

async function clipShot(name: string, cx: number, cy: number, w = 260, h = 200) {
  const x = Math.max(0, Math.min(900 - w, cx - w / 2));
  const y = Math.max(0, Math.min(500 - h, cy - h / 2));
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x, y, width: w, height: h } });
}

async function catPosition() {
  const critters = await page.evaluate(
    () => (window as unknown as Probe).__worldCritterTransforms?.() ?? [],
  );
  const cat = critters.find((c) => c[0] === 'cat-0');
  return cat ? { x: cat[1], z: cat[3] } : null;
}

// Walk to the elder — the greeting quest's trail chip navigates to it —
// then zoom all the way in. The camera settles between the avatar and the
// elder, so both stay in frame at the same pose for every tier.
await page.getByTestId('trail-quest-greeting').click();
await waitForWalkerIdle();
for (let i = 0; i < 4; i += 1) {
  await page.getByTestId('zoom-in').click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(600);

mkdirSync(out, { recursive: true });

const avatar = await page.evaluate(() => (window as unknown as Probe).__worldAt ?? null);
const elder = await page.evaluate(
  () => (window as unknown as Probe).__worldNpcs?.['npc-elder'] ?? null,
);
const cat = await catPosition();
if (!avatar || !elder) throw new Error('probe did not expose avatar/elder positions');

for (const tier of ['low', 'medium', 'high']) {
  await setTier(page, tier);
  await page.screenshot({ path: `${out}/full-${tier}.png` });
  const pa = await screenPoint(avatar.x, avatar.z);
  if (pa) await clipShot(`avatar-${tier}`, pa.x, pa.y);
  const pe = await screenPoint(elder.x, elder.z);
  if (pe) await clipShot(`elder-${tier}`, pe.x, pe.y);
  const catPos = await catPosition();
  const pc = catPos ? await screenPoint(catPos.x, catPos.z) : null;
  if (pc) await clipShot(`cat-${tier}`, pc.x, pc.y, 200, 160);
  console.log(`captured ${tier} (avatar=${!!pa} elder=${!!pe} cat=${!!pc})`);
}

await browser.close();
console.log(`done → ${out}`);
