import { test, expect, type Page } from '@playwright/test';
import { startGame, seedCompletedQuests } from './harness.ts';
import { openQuestDialogue } from './npcTap.ts';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';

/**
 * Semantic-comprehension storyboard (PR M): captures every consequence and
 * reinforce frame a child sees, for adult review against the "can a child
 * describe the physical consequence" bar. Outputs land in test-results/.
 * quest-cave-crystal is excluded — its NPC lives in the cave map and its
 * trail chip is disabled in town by design (covered by cave.spec.ts).
 */
const QUESTS: QuestId[] = [
  'quest-helping',
  'quest-tidying',
  'quest-park-kite',
  'quest-river-shell',
  'quest-bread-errand',
  'quest-school-answer',
  'quest-greeting',
];

/** Clipped page screenshot — no stability wait; the ~1s reinforce beat would unmount mid-shot. */
async function snap(page: Page, testId: string, path: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (box) await page.screenshot({ path, clip: box });
}

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
      await snap(page, 'encounter-response', `test-results/m-${q}-s${i}-response.png`);
      await expect(page.getByTestId('encounter-reinforce')).toBeVisible({ timeout: 10000 });
      await snap(page, 'encounter-reinforce', `test-results/m-${q}-s${i}-reinforce.png`);
    }
  });
}
