import { expect, test, type Page } from '@playwright/test';
import { seedCompletedQuests, startGame } from './harness.ts';
import {
  critterTransforms,
  factDecorationsProbe,
  npcProbe,
  playerAt,
  reactionsProbe,
  reactionStatsProbe,
  tapReactivePoint,
  tapWorldAnchor,
  waitForProbe,
  waitForWalkerIdle,
  worldPoints,
  type WorldProbe,
} from './npcTap.ts';

// PR Q — child delight / emotional polish. These tests verify CHAINS, not
// units: child action → the world noticed → a character/object answered →
// the state settled. The coverage table lives in docs/QA.md.

const battleState = (page: Page) =>
  page.evaluate(() => (window as unknown as WorldProbe).__worldBattleState ?? null);

async function waitForBattlePhase(page: Page, phase: string) {
  await expect.poll(async () => (await battleState(page))?.phase, { timeout: 15000 }).toBe(phase);
}

// Same figure-tap entry as battle.spec's helper — kept local so this spec
// stays self-contained (never import from another spec file).
async function tapMouseForBattle(page: Page, npcId = 'npc-playful-mouse', timeout = 60000) {
  await waitForProbe(page);
  const scene = page.getByTestId('battle-scene');
  const deadline = Date.now() + timeout;
  let attempt = 0;
  for (;;) {
    if (await scene.isVisible().catch(() => false)) return true;
    const npc = await npcProbe(page, npcId);
    const points = npc !== null ? await worldPoints(page, npc.x, npc.z) : [];
    attempt += 1;
    const pt = points.length > 0 ? (points[(attempt - 1) % points.length] ?? null) : null;
    if (pt === null) {
      if (Date.now() > deadline) return false;
      await page.waitForTimeout(800);
      continue;
    }
    await page.mouse.click(pt.x, pt.y);
    const opened = await scene
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(500);
  }
}

test.describe('the world noticed me', () => {
  test('arriving at the fountain earns a fish notice — they swim over to see me', async ({
    page,
  }) => {
    await startGame(page);
    const before = (await reactionsProbe(page)).length;
    // anchor-fountain is the landmark itself (not navigable); path-west-far
    // settles ~2.7u from the basin rim — inside the fish notice radius.
    await tapWorldAnchor(page, 'anchor-path-west-far');
    await waitForWalkerIdle(page);
    // The chain: child settles by the water → each fish takes one bounded
    // hop toward the child's rim → the flourish settles (active returns 0).
    const reactions = await reactionsProbe(page);
    const notices = reactions.slice(before).filter((r) => r.reaction === 'notice');
    expect(notices.some((r) => r.subject.startsWith('fish'))).toBe(true);
    await page.waitForTimeout(1200);
    expect((await reactionStatsProbe(page)).active).toBe(0);
  });

  test('tapping a flower answers visibly AND the child still goes to see', async ({ page }) => {
    await startGame(page);
    await waitForWalkerIdle(page);
    // Full chain: tap flower → flower bends → child walks toward it → settle.
    await tapReactivePoint(page, 2, -2.6);
    const reactions = await reactionsProbe(page);
    expect(reactions.some((r) => r.reaction === 'bend' && r.subject.startsWith('flower'))).toBe(
      true,
    );
    await expect.poll(() => playerAt(page)).toBe('anchor-path-north');
    await page.waitForTimeout(1200);
    expect((await reactionStatsProbe(page)).active).toBe(0);
  });

  test('winning the ball game earns a celebrating friend — he stays', async ({ page }) => {
    test.setTimeout(120000);
    await startGame(page);
    await tapWorldAnchor(page, 'anchor-path-west');
    expect(await tapMouseForBattle(page)).toBe(true);
    await waitForBattlePhase(page, 'playerChoice');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('battle-action-ball').click();
      if (i < 2) await waitForBattlePhase(page, 'playerChoice');
    }
    await waitForBattlePhase(page, 'victory');
    // "Friendly celebration", not "enemy driven off": the mouse stays on
    // screen, fully visible, mid-hop.
    const opponent = page.getByTestId('battle-opponent');
    await expect(opponent).toBeVisible();
    await expect(opponent).toHaveAttribute('data-phase', 'victory');
    await page.waitForTimeout(900); // longer than the celebrate hop
    await expect(opponent).toBeVisible();
  });

  test('a completed errand leaves its thing in the world — the save says so', async ({ page }) => {
    await startGame(page);
    // The world remembers facts it already saved — no new persisted flags.
    await seedCompletedQuests(page, ['quest-river-shell', 'quest-park-kite']);
    const decos = await factDecorationsProbe(page);
    expect(decos).toContain('deco-river-shell');
    expect(decos).toContain('deco-park-kite');
  });

  test('silent mode (no copy, reduced motion): the chain still lands', async ({ page }) => {
    // Full comprehension mode: copy stripped, physical state only, motion
    // free — the reaction still fires and the child still arrives.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page, '/?kidtest=nocopy,noactionicons');
    await tapReactivePoint(page, 2, -2.6);
    const reactions = await reactionsProbe(page);
    expect(reactions.some((r) => r.reaction === 'bend')).toBe(true);
    await expect.poll(() => playerAt(page)).toBe('anchor-path-north');
    // Critters exist and are probed — ambient presentation stays queryable
    // under the silent contract.
    const transforms = await critterTransforms(page);
    expect(transforms.length).toBeGreaterThan(0);
  });
});
