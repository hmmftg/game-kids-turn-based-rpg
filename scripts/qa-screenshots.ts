// Dev-only: capture hub screenshots per quality tier + a lifecycle regression
// pass (Hub → Parent Area → Hub → Portrait blocker → Landscape → tier change →
// Hub) verifying the remounted canvas still renders and metrics stay stable —
// this exercises the shared-resource disposal contract.
// Requires `npm run dev -- --port 5199` and chromium with SwiftShader.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = 'http://localhost:5199';
const out = process.argv[2] ?? '/tmp/qa-shots';

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
await page.goto(base);
await page.getByTestId('start-button').click();
await page.getByTestId('avatar-aban').click();
await page.getByTestId('headwear-next').click();
await page.getByTestId('badge-0').click();
await page.getByTestId('hud').waitFor();
await page.getByTestId('world-canvas').waitFor();
await page.waitForTimeout(800);

async function setTier(tier: string) {
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

async function objectCount() {
  return page.evaluate(() => {
    const w = window as unknown as {
      __worldScene?: { traverse: (cb: () => void) => void };
    };
    let n = 0;
    w.__worldScene?.traverse(() => (n += 1));
    return n;
  });
}

mkdirSync(out, { recursive: true });

const counts: Record<string, number> = {};
for (const tier of ['low', 'medium', 'high']) {
  await setTier(tier);
  counts[tier] = await objectCount();
  await page.screenshot({ path: `${out}/hub-${tier}.png` });
  console.log(`captured ${tier} (${counts[tier]} objects)`);
}

// Narrow landscape viewport (smallest supported form factor).
await page.setViewportSize({ width: 640, height: 360 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/hub-high-narrow.png` });
console.log('captured high at 640x360');

// Lifecycle regression: portrait blocker → landscape → Hub → parent area →
// Hub → tier change → Hub. The canvas remounts each time; object count must
// not shrink (disposed shared resources would drop meshes).
await page.setViewportSize({ width: 420, height: 800 });
await page.getByTestId('orientation-blocker').waitFor({ timeout: 8000 });
await page.setViewportSize({ width: 900, height: 500 });
await page.getByTestId('world-canvas').waitFor();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(400);
const afterPortrait = await objectCount();
console.log(`after portrait blocker: ${afterPortrait} objects`);

await page.getByTestId('pause-button').click();
await page.getByTestId('parent-entry-pause').click();
const hold = await page.getByTestId('parent-gate-hold').boundingBox();
if (!hold) throw new Error('parent-gate-hold has no bounding box');
await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
await page.mouse.down();
await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
await page.mouse.up();
await page.getByTestId('parent-close').click();
await page.getByTestId('world-canvas').waitFor();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(400);
const afterParent = await objectCount();
console.log(`after parent area remount: ${afterParent} objects`);

await setTier('low');
await setTier('high');
const afterTierCycle = await objectCount();
console.log(`after tier cycle: ${afterTierCycle} objects`);

const expected = counts.high;
if (afterPortrait !== expected || afterParent !== expected || afterTierCycle !== expected) {
  console.error(
    `REGRESSION: expected ${expected} objects at high tier after remounts ` +
      `(portrait=${afterPortrait}, parent=${afterParent}, tierCycle=${afterTierCycle})`,
  );
  process.exitCode = 1;
} else {
  console.log('lifecycle regression OK: shared resources survived all remounts');
}

await browser.close();
