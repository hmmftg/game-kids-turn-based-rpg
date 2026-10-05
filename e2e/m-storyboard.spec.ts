import { test, expect } from '@playwright/test';
import { startGame, seedCompletedQuests } from './harness.ts';
import { openQuestDialogue } from './npcTap.ts';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';

// Scratch storyboard: screenshot every consequence + reinforce scene.
const QUESTS: QuestId[] = [
  'quest-helping',
  'quest-tidying',
  'quest-park-kite',
  'quest-river-shell',
  'quest-bread-errand',
  'quest-school-answer',
  'quest-cave-crystal',
  'quest-greeting',
];

test.setTimeout(300000);
for (const q of QUESTS) {
  test(`storyboard ${q}`, async ({ page }) => {
    await startGame(page);
    await seedCompletedQuests(page, [...getQuestDefinition(q).requires]);
    await openQuestDialogue(page, q);
    await page.getByTestId('start-quest').click();
    for (const [i, step] of getQuestDefinition(q).steps.entries()) {
      await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 20000 });
      await page.getByTestId(`scene-${step.correctIconId}`).click();
      await expect(page.getByTestId('encounter-response')).toBeVisible({ timeout: 10000 });
      await page.getByTestId('encounter-response').screenshot({
        path: `test-results/m-${q}-s${i}-response.png`,
      });
      await expect(page.getByTestId('encounter-reinforce')).toBeVisible({ timeout: 10000 });
      await page.getByTestId('encounter-reinforce').screenshot({
        path: `test-results/m-${q}-s${i}-reinforce.png`,
      });
    }
  });
}
