import { expect, test, type Page } from '@playwright/test';
import { startGame, resumeFromPicker } from './harness.ts';
import {
  attentionProbe,
  tapNpcFigure,
  tapWorldAnchor,
  tapWorldGround,
  waitForWalkerIdle,
  type WorldProbe,
} from './npcTap.ts';

// Delight PR 1 — presentation liveliness. Avatar/NPC idle flourishes are
// bounded polish: they must never enter the semantic instrumentation stream,
// must never repeat on dwell or rerenders, and must never block navigation.
// Arrival reactions keep their identity: one avatar arrival → at most one
// notices-child per NPC.

const animationEvents = (page: Page) =>
  page.evaluate(() => (window as unknown as WorldProbe).__worldAnimationEvents ?? []);

const noticesFor = async (page: Page, npcId: string) =>
  (await animationEvents(page)).filter(
    (e) => e.type === 'character-react' && e.subjectId === npcId && e.context === 'notices-child',
  );

test('one arrival produces at most one notices-child per NPC', async ({ page }) => {
  await startGame(page);

  // Leave the spawn square, then walk back: the resident notices the child
  // once. The square's centre is covered by the locked finale hotspot (a tap
  // zone that intentionally swallows clicks), so the return tap lands just
  // south of the anchor — still nearest to the square.
  await tapWorldGround(page, 0, 3);
  await waitForWalkerIdle(page);
  await tapWorldGround(page, 0, 1.2);
  await waitForWalkerIdle(page);
  const first = await attentionProbe(page);
  expect(first?.npcId).toBe('npc-elder');
  expect(first?.context).toBe('notices-child');
  expect(first?.arrivalNonce).toBeGreaterThan(0);

  // Dwell: no amount of standing around repeats the cue.
  await page.waitForTimeout(2000);
  expect(await noticesFor(page, 'npc-elder')).toHaveLength(1);

  // A camera pan — and the re-renders it causes — mints no new arrival:
  // arrivalNonce is monotonic per completed walk, never per render.
  const canvas = page.locator('#world-canvas canvas, .world canvas').first();
  const box = await canvas.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 140, box!.y + box!.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await page.waitForTimeout(800);
  expect((await attentionProbe(page))?.arrivalNonce).toBe(first!.arrivalNonce);
  expect(await noticesFor(page, 'npc-elder')).toHaveLength(1);

  // Walk away and back: a NEW arrival earns a fresh cue — same npc, second
  // arrivalNonce, exactly one more semantic event.
  await tapWorldGround(page, 0, 3);
  await waitForWalkerIdle(page);
  await tapWorldGround(page, 0, 1.2);
  await waitForWalkerIdle(page);
  const second = await attentionProbe(page);
  expect(second?.npcId).toBe('npc-elder');
  expect(second?.arrivalNonce).toBeGreaterThan(first!.arrivalNonce!);
  await page.waitForTimeout(2000);
  expect(await noticesFor(page, 'npc-elder')).toHaveLength(2);
});

test('presentation liveliness never enters semantic instrumentation', async ({ page }) => {
  await startGame(page);
  await tapWorldGround(page, 0, 3);
  await waitForWalkerIdle(page);
  await tapWorldGround(page, 0, 1.2);
  await waitForWalkerIdle(page);
  await page.waitForTimeout(2500);

  const events = await animationEvents(page);
  // Idle cues, blinks, settle/glance flourishes and held activity poses are
  // presentation-only: the semantic stream may only ever carry the closed
  // CharacterReact vocabulary.
  for (const e of events) {
    expect([
      'receives-kite',
      'receives-shell',
      'receives-crystal',
      'looks-at-book',
      'questioning',
      'greets-child',
      'notices-child',
      'celebrates',
      undefined,
    ]).toContain(e.context);
    expect(e.context).not.toBe('looks-around');
    expect(e.context).not.toBe('blink');
  }
  // And every semantic episode has long settled — nothing keeps animating.
  const stats = await page.evaluate(() => (window as unknown as WorldProbe).__worldAnimationStats);
  expect(stats?.active).toBe(0);

  // Navigation and talk still work around the flourishes.
  await tapNpcFigure(page, 'npc-elder');
  await expect(page.getByTestId('npc-dialogue')).toBeVisible();
});

test('reduced motion keeps state changes, drops flourish motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page);
  await tapWorldGround(page, 0, 3);
  await waitForWalkerIdle(page);
  await tapWorldGround(page, 0, 1.2);
  await waitForWalkerIdle(page);
  const attention = await attentionProbe(page);
  expect(attention?.npcId).toBe('npc-elder');
  await page.waitForTimeout(1500);
  expect(await noticesFor(page, 'npc-elder')).toHaveLength(1);
  const stats = await page.evaluate(() => (window as unknown as WorldProbe).__worldAnimationStats);
  expect(stats?.active).toBe(0);
});

test('a reload does not replay arrival liveliness', async ({ page }) => {
  await startGame(page);
  await tapWorldAnchor(page, 'anchor-square');
  await waitForWalkerIdle(page);
  await page.reload();
  await resumeFromPicker(page);
  await page.waitForTimeout(2000);
  // Fresh session: spawn is not an arrival — no notices-child, no flourish.
  expect(await noticesFor(page, 'npc-elder')).toHaveLength(0);
});
