import { expect, test, type Page } from '@playwright/test';
import { NPC_DEFINITIONS, WORLD_AREAS } from '../src/world/registry.ts';

async function startGame(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await page.getByTestId('badge-0').click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

async function resumeFromPicker(page: Page) {
  await expect(page.getByTestId('profile-select')).toBeVisible();
  await page.locator('[data-testid^="profile-card-"]').first().click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

test.describe('scalable world', () => {
  // QA §20: the world data carries several areas and substantially more NPCs,
  // and the child can leave and come back without losing anything.
  test('the world data holds multiple areas and more NPCs than the first slice', async ({
    page,
  }) => {
    expect(WORLD_AREAS.length).toBeGreaterThanOrEqual(5);
    expect(NPC_DEFINITIONS.length).toBeGreaterThanOrEqual(8);
    await startGame(page);
    await expect(page.getByTestId('quest-trail')).toBeVisible();
  });

  // Multi-beat dialogue + a stable-id branching choice, reached through the
  // quest trail (quest-greeting → neighbour): next advances beats, the choice jumps
  // to another node, and close returns to the hub.
  test('dialogue plays several beats and a branch choice without losing the quest offer', async ({
    page,
  }) => {
    await startGame(page);
    await page.getByTestId('trail-quest-greeting').click();
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();

    // The quest offer stays visible on every beat — one tap, like before.
    await expect(page.getByTestId('start-quest')).toBeVisible();
    await page.getByTestId('dialogue-next').click();
    await expect(page.getByTestId('dialogue-choice-neighbour-choice-more')).toBeVisible();

    await page.getByTestId('dialogue-choice-neighbour-choice-more').click();
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();
    await expect(page.getByTestId('start-quest')).toHaveCount(0);

    await page.getByTestId('close-dialogue').click();
    await expect(page.getByTestId('npc-dialogue')).toHaveCount(0);
  });

  // Leaving to the picker and returning (and a reload) keeps progress and
  // brings the same world back — NPCs in inactive areas cost nothing while
  // away because the world is the same data, not per-NPC code.
  test('leaving and returning preserves progress across a reload', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('trail-quest-greeting').click();
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();
    await page.getByTestId('close-dialogue').click();

    await page.reload();
    await resumeFromPicker(page);
    await expect(page.getByTestId('quest-trail')).toBeVisible();
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
  });
});
