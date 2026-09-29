import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';

const LANDSCAPE = { width: 880, height: 420 };
const PORTRAIT = { width: 360, height: 800 };

async function startGame(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await page.getByTestId('badge-0').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('world-canvas')).toBeVisible();
}

/** Tags the live canvas element so we can prove identity across rotations. */
async function tagCanvas(page: Page) {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__probeCanvas = document.querySelector(
      '#world-canvas canvas, .world canvas',
    );
  });
}

async function expectSameCanvas(page: Page) {
  const same = await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>).__probeCanvas ===
      document.querySelector('#world-canvas canvas, .world canvas'),
  );
  expect(same).toBe(true);
  await expect(page.getByTestId('world-canvas')).toBeVisible();
}

async function expectHudIntact(page: Page) {
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('pause-button')).toBeVisible();
  await expect(page.getByTestId('quest-trail')).toBeVisible();
  await expect(page.getByTestId('objective-chip')).toBeVisible();
}

test.describe('orientation', () => {
  test('rotation never blocks, keeps the same canvas, and preserves the hud', async ({ page }) => {
    await startGame(page);
    await tagCanvas(page);

    for (const size of [PORTRAIT, LANDSCAPE, PORTRAIT, LANDSCAPE]) {
      await page.setViewportSize(size);
      await expect(page.getByTestId('orientation-blocker')).toHaveCount(0);
      await expectSameCanvas(page);
      await expectHudIntact(page);
    }
  });

  test('a dialogue stays open and usable across a rotation', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('trail-quest-greeting').click();
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();
    await tagCanvas(page);

    await page.setViewportSize(PORTRAIT);
    await expectSameCanvas(page);
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();
    await expect(page.getByTestId('start-quest')).toBeVisible();

    await page.setViewportSize(LANDSCAPE);
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();
    await page.getByTestId('close-dialogue').click();
    await expect(page.getByTestId('npc-dialogue')).toHaveCount(0);
  });

  test('an encounter choice phase survives rotation in both directions', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('trail-quest-greeting').click();
    await page.getByTestId('start-quest').click();
    await page.getByTestId('advance-intro').click();
    await page.getByTestId('advance-demonstrate').click();
    await tagCanvas(page);

    const step = getQuestDefinition('quest-greeting').steps[0]!;
    await page.setViewportSize(PORTRAIT);
    await expectSameCanvas(page);
    await page.getByTestId(`scene-${step.correctIconId}`).click();
    await expect(page.getByTestId('advance-response')).toBeVisible();

    await page.setViewportSize(LANDSCAPE);
    await expectSameCanvas(page);
    await page.getByTestId('advance-response').click();
    await expect(page.getByTestId('advance-reinforce')).toBeVisible();
  });

  test('pause and resume still work in portrait', async ({ page }) => {
    await startGame(page);
    await page.setViewportSize(PORTRAIT);
    await page.getByTestId('pause-button').click();
    await expect(page.getByTestId('resume-button')).toBeVisible();
    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
  });

  test('the parent area round-trips in portrait', async ({ page }) => {
    await startGame(page);
    await page.setViewportSize(PORTRAIT);
    await page.getByTestId('pause-button').click();
    await page.getByTestId('parent-entry-pause').click();
    const hold = await page.getByTestId('parent-gate-hold').boundingBox();
    if (!hold) throw new Error('parent-gate-hold has no bounding box');
    await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
    await page.mouse.down();
    await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
    await page.mouse.up();
    await page.getByTestId('parent-close').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(page.getByTestId('world-canvas')).toBeVisible();
  });

  test('rotation mid-walk does not cancel movement: arrival opens the dialogue', async ({
    page,
  }) => {
    await startGame(page);
    await tagCanvas(page);

    // Tapping the trail sends the avatar walking; the dialogue opens on arrival.
    await page.getByTestId('trail-quest-greeting').click();
    // Rotate immediately, while the walker is still travelling.
    await page.setViewportSize(PORTRAIT);
    await expectSameCanvas(page);
    await expect(page.getByTestId('npc-dialogue')).toBeVisible({ timeout: 15000 });

    await page.setViewportSize(LANDSCAPE);
    await expectSameCanvas(page);
    await page.getByTestId('close-dialogue').click();
    await expect(page.getByTestId('quest-trail')).toBeVisible();
  });

  test('golden path: walk → rotate → arrive → quest → completion across rotations', async ({
    page,
  }) => {
    await startGame(page);
    await tagCanvas(page);

    // Start the first quest; rotate mid-walk and confirm arrival opens dialogue.
    await page.getByTestId('trail-quest-greeting').click();
    await page.setViewportSize(PORTRAIT);
    await expectSameCanvas(page);
    await expect(page.getByTestId('npc-dialogue')).toBeVisible({ timeout: 15000 });

    // Start the encounter and make the first correct choice in portrait.
    const steps = getQuestDefinition('quest-greeting').steps;
    await page.getByTestId('start-quest').click();
    await page.getByTestId('advance-intro').click();
    await page.getByTestId('advance-demonstrate').click();
    await page.getByTestId(`scene-${steps[0]!.correctIconId}`).click();
    await expect(page.getByTestId('advance-response')).toBeVisible();

    // Rotate back to landscape mid-encounter; the phase must not reset.
    await page.setViewportSize(LANDSCAPE);
    await expectSameCanvas(page);
    await page.getByTestId('advance-response').click();
    await page.getByTestId('advance-reinforce').click();

    // Finish remaining steps in landscape.
    for (const step of steps.slice(1)) {
      await page.getByTestId('advance-intro').click();
      await page.getByTestId('advance-demonstrate').click();
      await page.getByTestId(`scene-${step.correctIconId}`).click();
      await page.getByTestId('advance-response').click();
      await page.getByTestId('advance-reinforce').click();
    }

    const dismiss = page.getByTestId('celebration-continue');
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');

    // Final rotation back to portrait: completion survives the whole cycle.
    await page.setViewportSize(PORTRAIT);
    await expectSameCanvas(page);
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
    await expectHudIntact(page);
  });

  test('a completed quest stays completed after a rotation cycle', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('trail-quest-greeting').click();
    await page.getByTestId('start-quest').click();
    for (const step of getQuestDefinition('quest-greeting').steps) {
      await page.getByTestId('advance-intro').click();
      await page.getByTestId('advance-demonstrate').click();
      await page.getByTestId(`scene-${step.correctIconId}`).click();
      await page.getByTestId('advance-response').click();
      await page.getByTestId('advance-reinforce').click();
    }
    const dismiss = page.getByTestId('celebration-continue');
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');

    await tagCanvas(page);
    await page.setViewportSize(PORTRAIT);
    await page.setViewportSize(LANDSCAPE);
    await expectSameCanvas(page);
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
  });
});
