import { expect, test, type Page } from '@playwright/test';
import {
  enableWorldProbe,
  npcProbe,
  tapWorldAnchor,
  waitForProbe,
  worldPoints,
  type WorldProbe,
} from './npcTap.ts';

async function startGame(page: Page) {
  await enableWorldProbe(page);
  await page.goto('/');
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

async function battleState(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldBattleState ?? null);
}

async function waitForPhase(page: Page, phase: string) {
  await expect.poll(async () => (await battleState(page))?.phase, { timeout: 15000 }).toBe(phase);
}

/**
 * Taps the playful mouse's figure where it stands until the battle opens —
 * same projection/retry discipline as tapNpcFigure, but the awaited surface
 * is the battle scene, not a dialogue card.
 */
async function tapBattleOpponent(page: Page, npcId: string, timeout = 60000): Promise<boolean> {
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

test.describe('micro turn-based battle', () => {
  test.setTimeout(120000);

  // PR I contract: a deliberate tap on the playful mouse's figure starts a
  // standalone 1v1 — intro auto-plays, then the child chooses a physical
  // object (soft ball or cushion) once per round.
  test('tapping the playful mouse starts a battle the child can win with the ball', async ({
    page,
  }) => {
    await startGame(page);
    // Walk near the fountain first — the figure must be on-screen to tap.
    await tapWorldAnchor(page, 'anchor-path-west');
    expect(await tapBattleOpponent(page, 'npc-playful-mouse')).toBe(true);
    await expect(page.getByTestId('battle-scene')).toBeVisible();

    // Intro auto-advances — the child never taps to continue.
    await waitForPhase(page, 'playerChoice');
    await expect(page.getByTestId('battle-action-ball')).toBeVisible();
    await expect(page.getByTestId('battle-action-shield')).toBeVisible();
    expect((await battleState(page))?.opponentHearts).toBe(3);

    // One action per round; the resting mouse takes one heart per ball.
    await page.getByTestId('battle-action-ball').click();
    await waitForPhase(page, 'playerChoice');
    expect((await battleState(page))?.opponentHearts).toBe(2);
    expect((await battleState(page))?.round).toBe(2);

    await page.getByTestId('battle-action-ball').click();
    await waitForPhase(page, 'playerChoice');
    expect((await battleState(page))?.opponentHearts).toBe(1);

    await page.getByTestId('battle-action-ball').click();
    await waitForPhase(page, 'victory');
    await expect(page.getByTestId('battle-continue')).toBeVisible();

    // LEAVE_BATTLE is the only exit — back to a plain hub, nothing persisted.
    await page.getByTestId('battle-continue').click();
    await expect(page.getByTestId('battle-scene')).toHaveCount(0);
    await expect.poll(async () => battleState(page)).toBeNull();
    await expect(page.getByTestId('hud')).toBeVisible();
  });

  // Input ownership: while battle !== null the overlay covers the whole HUD —
  // the pause button and quest trail sit beneath it and cannot be reached.
  test('the battle owns all child input until it is left', async ({ page }) => {
    await startGame(page);
    await tapWorldAnchor(page, 'anchor-path-west');
    expect(await tapBattleOpponent(page, 'npc-playful-mouse')).toBe(true);
    await waitForPhase(page, 'playerChoice');

    const covered = await page.evaluate(() => {
      const pause = document.querySelector('[data-testid="pause-button"]');
      const battle = document.querySelector('[data-testid="battle-scene"]');
      if (!pause || !battle) return 'missing';
      const rect = pause.getBoundingClientRect();
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return top !== null && battle.contains(top) ? 'covered' : 'exposed';
    });
    expect(covered).toBe('covered');

    // A cushion tap is harmless — the mouse rests, nothing is punished.
    await page.getByTestId('battle-action-shield').click();
    await waitForPhase(page, 'playerChoice');
    expect((await battleState(page))?.opponentHearts).toBe(3);

    // Leaving mid-battle is always free and returns to the hub.
    await page.getByTestId('leave-battle').click();
    await expect(page.getByTestId('battle-scene')).toHaveCount(0);
    await expect.poll(async () => battleState(page)).toBeNull();
  });
});
