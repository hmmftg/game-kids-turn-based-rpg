import { expect, test, type Page } from '@playwright/test';
import { startGame } from './harness.ts';
import {
  playerAt,
  reactionsProbe,
  tapReactivePoint,
  tapWorldAnchor,
  waitForWalkerIdle,
  type WorldProbe,
} from './npcTap.ts';

// Delight PR 2 — reactive world objects. A tap on a physical thing produces
// ONE bounded reaction layered on the world's ordinary tap semantics: the
// object answers AND the touch still navigates like a plain ground tap
// (discover → approach), so a prop tap is never a dead touch and never
// steals a walk waypoint. The object stays the subject: flowers bend, the
// fountain bloops while its fish dart, a door swings open a crack.

const semanticEvents = (page: Page) =>
  page.evaluate(() => (window as unknown as WorldProbe).__worldAnimationEvents ?? []);

const activeSemantic = (page: Page) =>
  page.evaluate(() => (window as unknown as WorldProbe).__worldAnimationStats?.active);

test('a tapped flower bends once and the child still approaches', async ({ page }) => {
  await startGame(page);
  await waitForWalkerIdle(page);

  await tapReactivePoint(page, 2, -2.6); // authored flower slot near the square
  await page.waitForTimeout(300);
  const reactions = await reactionsProbe(page);
  expect(reactions.some((r) => r.reaction === 'bend' && r.subject.startsWith('flower'))).toBe(true);
  // Not a dead touch: the tap navigates exactly like the ground tap it is —
  // the child walks to the nearest anchor (path-north) to go see.
  await expect.poll(() => playerAt(page)).toBe('anchor-path-north');
});

test('every reaction stays out of the semantic stream and settles', async ({ page }) => {
  await startGame(page);
  await tapReactivePoint(page, -2.2, -2.4); // plant → sway
  await waitForWalkerIdle(page);
  await tapReactivePoint(page, 2, -2.6); // flower → bend
  await page.waitForTimeout(1100); // longer than any flourish
  const reactions = await reactionsProbe(page);
  expect(reactions.some((r) => r.reaction === 'sway')).toBe(true);
  expect(reactions.some((r) => r.reaction === 'bend')).toBe(true);
  // Presentation never enters `__worldAnimationEvents` — no episode carries a
  // prop-reaction name (the underlying taps may still walk, which can fire a
  // normal notices-child on arrival, exactly like a plain ground tap).
  const propReactions = new Set(['bend', 'sway', 'bloop', 'door-swing']);
  for (const event of await semanticEvents(page)) {
    expect(propReactions.has(event.type)).toBe(false);
    expect(event.context === undefined || !propReactions.has(event.context)).toBe(true);
  }
  expect((await activeSemantic(page)) ?? 0).toBe(0);
});

test('the fountain bloops, fish dart, and the tap keeps its normal meaning', async ({ page }) => {
  await startGame(page);
  await tapWorldAnchor(page, 'anchor-path-west');
  await waitForWalkerIdle(page);
  const at = await playerAt(page);

  await tapReactivePoint(page, -6, -0.6); // basin rim closest to the child
  await page.waitForTimeout(300);
  expect(
    (await reactionsProbe(page)).some((r) => r.reaction === 'bloop' && r.subject === 'fountain'),
  ).toBe(true);
  // Navigation unchanged: the fountain stands inside its quest hotspot zone,
  // so the touch keeps exactly the meaning a plain ground tap has there —
  // the child stays put while the encounter UI may take over the canvas.
  await waitForWalkerIdle(page);
  expect(await playerAt(page)).toBe(at);
});

test('a tapped door swings open a crack and closes', async ({ page }) => {
  await startGame(page);
  await waitForWalkerIdle(page);
  // The square's wide doorway — tapped on the door itself (its panel stands
  // above the ground, so aim at its centre like a child's finger).
  await tapReactivePoint(page, 0, -0.41, 0.4);
  await page.waitForTimeout(300);
  const reactions = await reactionsProbe(page);
  expect(reactions.some((r) => r.reaction === 'door-swing' && r.subject === 'door-square')).toBe(
    true,
  );
  // The tap still means "go there" — the square is already the nearest
  // anchor, so the child stays put while the door cracks open.
  await waitForWalkerIdle(page);
  expect(await playerAt(page)).toBe('anchor-square');

  // Repeatable: a second touch answers again.
  await tapReactivePoint(page, 0, -0.41, 0.4);
  await page.waitForTimeout(300);
  const swings = (await reactionsProbe(page)).filter((r) => r.reaction === 'door-swing');
  expect(swings.length).toBeGreaterThanOrEqual(2);
});

test('reduced motion still registers the reaction, drops the flourish', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page);
  await tapReactivePoint(page, 2, -2.6);
  await page.waitForTimeout(300);
  expect((await reactionsProbe(page)).some((r) => r.reaction === 'bend')).toBe(true);
  expect((await activeSemantic(page)) ?? 0).toBe(0);
});
