import { expect, test } from '@playwright/test';
import { QUEST_DEFINITIONS } from '../src/domain/quests/definitions.ts';
import { seedCompletedQuests, startGame } from './harness.ts';

/** The «اینجا را لمس کن» first-use cue teaches the first walk — with every
 *  quest complete there is nowhere left to go, so it must not sit on screen. */
test.describe('interaction hint', () => {
  test('shows on a fresh profile before the first arrival', async ({ page }) => {
    await startGame(page);
    await expect(page.getByTestId('interaction-hint')).toBeVisible();
  });

  test('is hidden once every quest is completed', async ({ page }) => {
    await seedCompletedQuests(
      page,
      QUEST_DEFINITIONS.map((q) => q.id),
    );
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(page.getByTestId('interaction-hint')).toBeHidden();
  });
});
