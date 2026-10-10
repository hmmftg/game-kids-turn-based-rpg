// Dev-only: capture hub screenshots per quality tier + a lifecycle regression
// pass (Hub → Parent Area → Hub → Portrait → Landscape → tier change → Hub)
// verifying the remounted canvas still renders, that orientation changes do
// NOT remount the canvas, and metrics stay stable — this exercises the
// shared-resource disposal contract.
// Requires `npm run dev -- --port 5199` and chromium with SwiftShader.
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { enableWorldProbe, openQuestDialogue, setTier as driveSetTier } from './drive-world.ts';

const base = 'http://localhost:5199';
const out = process.argv[2] ?? '/tmp/qa-shots';

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
// Research Session Mode is default-on and gates the start button behind a
// consent screen — opt out exactly like e2e does (harness.withoutResearch).
// The figure-tap flow below needs the world probe (__worldToScreen /
// __worldNpcs / __worldMoving) — same init flag e2e uses, before first goto.
await enableWorldProbe(page);
await page.goto(`${base}?research=0`);
await page.getByTestId('start-button').click();
// Kid-interaction states: human avatar picker + headwear preview.
await page.screenshot({ path: `${out}/avatar-select.png` });
await page.getByTestId('avatar-aban').click();
await page.screenshot({ path: `${out}/headwear-select.png` });
await page.getByTestId('headwear-next').click();
// The avatar flow goes straight to the hub now — the badge-selection step
// (`badge-0`) was removed; no equivalent step remains to click.
await page.getByTestId('hud').waitFor();
await page.getByTestId('world-canvas').waitFor();
await page.waitForTimeout(800);

async function setTier(tier: string) {
  await driveSetTier(page, tier);
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

/** Dev-only Canvas instance id (WorldCanvas.tsx) — proves no remount. */
async function canvasId(): Promise<number | undefined> {
  return page.evaluate(() => (window as unknown as { __worldCanvasId?: number }).__worldCanvasId);
}

/**
 * Encounter steps auto-play on dwell timers (usePacedAdvance): intro →
 * demonstrate → playerChoice → worldResponse → reinforce — only the physical
 * object tap is a real child action. Waiting for a scene-icon testid IS the
 * sync point; there are no advance-* controls to click.
 */
async function playSceneStep(sceneTestId: string) {
  await page.getByTestId(sceneTestId).waitFor({ timeout: 15000 });
  await page.getByTestId(sceneTestId).click();
}

/**
 * The celebration overlay appears on quest completion after the reinforce
 * beat's dwell — it can arrive a few seconds after the last object tap and
 * intercepts pointer events, so wait generously and dismiss it.
 */
async function dismissCelebration() {
  const dismiss = page.getByTestId('celebration-continue');
  const shown = await dismiss.waitFor({ state: 'visible', timeout: 15000 }).then(
    () => true,
    () => false,
  );
  if (shown) {
    await dismiss.click();
    await page.getByTestId('quest-celebration').waitFor({ state: 'hidden', timeout: 5000 });
  }
}

/** Rotates between landscape and portrait; settles before measuring. */
async function rotateTo(p: Page, viewport: { width: number; height: number }) {
  await p.setViewportSize(viewport);
  await p.waitForTimeout(400);
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

// Portrait viewport: the world must stay mounted and playable.
const idBeforePortrait = await canvasId();
await rotateTo(page, { width: 360, height: 800 });
if ((await canvasId()) !== idBeforePortrait) {
  console.error('REGRESSION: canvas remounted on landscape→portrait rotation');
  process.exitCode = 1;
}
await page.screenshot({ path: `${out}/hub-portrait.png` });
console.log('captured high at 360x800');

// Portrait HUD surfaces. The trail chip only navigates (interaction
// ownership) — dialogue opens via a deliberate figure tap, and encounter
// beats auto-play on dwell timers; only object taps are real child actions.
await openQuestDialogue(page, 'quest-greeting');
await page.screenshot({ path: `${out}/dialogue-portrait.png` });
await page.getByTestId('start-quest').click();
// Demonstrate beat: capture as soon as it appears (auto-advances quickly).
await page
  .getByTestId('scene-choice')
  .waitFor({ state: 'visible', timeout: 500 })
  .catch(() => page.screenshot({ path: `${out}/encounter-demonstrate.png` }));
await page.getByTestId('scene-icon-greet').waitFor({ timeout: 15000 });
// Choice state: the physical objects ARE the choices.
await page.screenshot({ path: `${out}/encounter-choice.png` });
await page.screenshot({ path: `${out}/encounter-portrait.png` });
// Successful action via the PRIMARY contextual target: the scene-strip
// neighbour. The press pulse delays the commit ~160ms, then the response
// card shows the truthful consequence scene.
await page.getByTestId('scene-icon-greet').click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/encounter-success.png` });
// greeting-2 opens automatically after reinforce dwells → quest completion.
await page.getByTestId('scene-icon-smile').waitFor({ timeout: 15000 });
await page.getByTestId('scene-icon-smile').click();
await dismissCelebration();
await page.getByTestId('hud').waitFor();

// quest-helping: help-carry step (tap the basket) then place step —
// the held-basket state + shelf/floor targets.
await openQuestDialogue(page, 'quest-helping');
await page.getByTestId('start-quest').click();
await playSceneStep('scene-icon-help-carry');
await page.getByTestId('scene-icon-place-basket').waitFor({ timeout: 15000 });
await page.waitForTimeout(700); // let the scene-arrive animation settle
await page.screenshot({ path: `${out}/scene-place-held.png` });
await page.getByTestId('scene-icon-place-basket').click();
await dismissCelebration();
await page.getByTestId('hud').waitFor();

// quest-tidying: pick step (leaf target; kick stays glyph-only) and the
// place-in-bin step (held leaf + bin/floor targets).
await openQuestDialogue(page, 'quest-tidying');
await page.getByTestId('start-quest').click();
await page.getByTestId('scene-icon-pick-up').waitFor({ timeout: 15000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/scene-pick.png` });
await page.getByTestId('scene-icon-pick-up').click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/scene-consequence.png` });
await page.getByTestId('scene-icon-basket-bin').waitFor({ timeout: 15000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/scene-place-targets.png` });
await page.getByTestId('scene-icon-basket-bin').click();
// Step 3 opens at intro automatically — leave-encounter is available there.
await page.getByTestId('leave-encounter').waitFor({ timeout: 15000 });
await page.getByTestId('leave-encounter').click();
await page.getByTestId('hud').waitFor();

await page.getByTestId('pause-button').click();
await page.screenshot({ path: `${out}/pause-portrait.png` });
await page.getByTestId('resume-button').click();
await page.getByTestId('hud').waitFor();

await page.getByTestId('pause-button').click();
await page.getByTestId('parent-entry-pause').click();
const holdBox = await page.getByTestId('parent-gate-hold').boundingBox();
if (!holdBox) throw new Error('parent-gate-hold has no bounding box');
await page.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
await page.mouse.down();
await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
await page.mouse.up();
await page.screenshot({ path: `${out}/parent-portrait.png` });
await page.getByTestId('parent-close').click();
await page.getByTestId('world-canvas').waitFor();
await page.getByTestId('hud').waitFor();
await page.waitForTimeout(400);

// Landscape after portrait: same world, no remount.
const idAfterPortrait = await canvasId();
await rotateTo(page, { width: 900, height: 500 });
if ((await canvasId()) !== idAfterPortrait) {
  console.error('REGRESSION: canvas remounted on portrait→landscape rotation');
  process.exitCode = 1;
}
await page.screenshot({ path: `${out}/hub-landscape-after-portrait.png` });
const afterPortrait = await objectCount();
console.log(`after portrait cycle: ${afterPortrait} objects`);

// Steady-state reference: measured at the settled post-quest, post-remount
// state (completed quests grow keepsake blossoms and remove markers, and
// the world repopulates fully on the first remount after quest exit), so
// neither the pre-quest tier counts nor the immediately-after-encounter
// count is a valid lifecycle baseline. Poll until three samples a second
// apart agree.
let expected = -1;
let stable = 0;
for (let i = 0; i < 30 && stable < 3; i += 1) {
  await page.waitForTimeout(1000);
  const n = await objectCount();
  stable = n === expected ? stable + 1 : 0;
  expected = n;
}
console.log(`steady-state reference: ${expected} objects`);

// Repeated rotations must also keep the same canvas instance.
await rotateTo(page, { width: 360, height: 800 });
await rotateTo(page, { width: 900, height: 500 });
await rotateTo(page, { width: 360, height: 800 });
await rotateTo(page, { width: 900, height: 500 });
if ((await canvasId()) !== idAfterPortrait) {
  console.error('REGRESSION: canvas remounted during repeated rotations');
  process.exitCode = 1;
}

// Parent-area remount regression (canvas unmounts there by design).
await page.getByTestId('pause-button').click();
await page.getByTestId('parent-entry-pause').click();
const hold2 = await page.getByTestId('parent-gate-hold').boundingBox();
if (!hold2) throw new Error('parent-gate-hold has no bounding box');
await page.mouse.move(hold2.x + hold2.width / 2, hold2.y + hold2.height / 2);
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

if (afterParent !== expected || afterTierCycle !== expected) {
  console.error(
    `REGRESSION: expected ${expected} objects at high tier after remounts ` +
      `(portrait=${afterPortrait}, parent=${afterParent}, tierCycle=${afterTierCycle})`,
  );
  process.exitCode = 1;
} else {
  console.log('lifecycle regression OK: shared resources survived all remounts');
}

// Reduced-motion capture: emulate `prefers-reduced-motion` and confirm the
// scene still renders (ambient critters must stay perched — decoration off,
// meaning intact). Reload so the non-reactive matchMedia read takes effect.
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
// A returning device lands on the profile picker, not straight into the hub.
await page.locator('[data-testid^="profile-card-"]').first().click();
await page.getByTestId('hud').waitFor({ timeout: 15000 });
await page.getByTestId('world-canvas').waitFor();
// The hook registers when Hub mounts, which lands just after the canvas
// element — wait for it rather than racing.
await page
  .waitForFunction(
    () =>
      typeof (window as unknown as { __worldCritterTransforms?: unknown })
        .__worldCritterTransforms === 'function',
    null,
    { timeout: 15000 },
  )
  .catch(() => null);
// Critter immobility under reduced motion: transforms (x, y, z, heading per
// critter, read via the dev-only __worldCritterTransforms hook) must not
// change across a window longer than any ambient idle delay (fish ≤ 4s,
// cat ≤ 6s — 7s covers both plus scheduling slack).
const critterTransforms = () =>
  page.evaluate(() => {
    const w = window as unknown as {
      __worldCritterTransforms?: () => readonly (readonly [
        string,
        number,
        number,
        number,
        number,
      ])[];
    };
    return w.__worldCritterTransforms?.() ?? null;
  });
const beforeMotion = await critterTransforms();
await page.waitForTimeout(7000);
const afterMotion = await critterTransforms();
await page.screenshot({ path: `${out}/hub-reduced-motion.png` });
if (!beforeMotion || !afterMotion) {
  console.error('REGRESSION: __worldCritterTransforms hook unavailable under reduced motion');
  process.exitCode = 1;
} else {
  const moved: string[] = [];
  for (const [i, b] of beforeMotion.entries()) {
    const a = afterMotion[i]!;
    const drift = Math.max(
      Math.abs(a[1]! - b[1]!),
      Math.abs(a[2]! - b[2]!),
      Math.abs(a[3]! - b[3]!),
      Math.abs(a[4]! - b[4]!),
    );
    if (drift > 1e-9) moved.push(`${b[0]} drift=${drift}`);
  }
  if (moved.length > 0) {
    console.error(`REGRESSION: critters moved under reduced motion: ${moved.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`reduced-motion immobility OK: ${beforeMotion.length} critters unchanged`);
  }
}
const reducedMotionObjects = await objectCount();
console.log(`captured reduced-motion hub (${reducedMotionObjects} objects)`);
if (reducedMotionObjects !== expected) {
  console.error(
    `REGRESSION: reduced-motion scene has ${reducedMotionObjects} objects, expected ${expected}`,
  );
  process.exitCode = 1;
}
await page.emulateMedia({ reducedMotion: null });

await browser.close();
