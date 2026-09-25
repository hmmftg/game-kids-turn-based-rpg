import { expect, test, type Page } from '@playwright/test';
import { QUEST_DEFINITIONS, getQuestDefinition } from '../src/domain/quests/definitions.ts';

const QUESTS = QUEST_DEFINITIONS.map((quest) => quest.id);

async function startGame(page: Page, avatar: 'avatar-aban' | 'avatar-arta' = 'avatar-aban') {
  await page.goto('/');
  await page.getByTestId('start-button').click();
  await page.getByTestId(avatar).click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

/** Plays one quest through every encounter step, always choosing correctly. */
async function playQuest(page: Page, questId: (typeof QUESTS)[number]) {
  await page.getByTestId(`trail-${questId}`).click();
  await page.getByTestId('start-quest').click();

  for (const step of getQuestDefinition(questId).steps) {
    await page.getByTestId('advance-intro').click();
    await page.getByTestId('advance-demonstrate').click();
    await page.getByTestId(`choice-${step.correctIconId}`).click();
    await page.getByTestId('advance-response').click();
    await page.getByTestId('advance-reinforce').click();
  }
  // The last reinforce closes the quest and returns to the hub with a new sticker.
  await expect(page.getByTestId(`trail-${questId}`)).toContainText('انجام شد');
}

test.describe('vertical slice', () => {
  test('first run reaches the hub and the first chapter is the only open one', async ({ page }) => {
    await startGame(page);
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
    await expect(page.getByTestId('trail-quest-helping')).toBeDisabled();
    await expect(page.getByTestId('quest-trail')).toBeVisible();
  });

  test('both avatars play identically', async ({ page }) => {
    await startGame(page, 'avatar-arta');
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
    await playQuest(page, 'quest-greeting');
  });

  test('all three quests and the cooperative finale can be completed in order', async ({
    page,
  }) => {
    await startGame(page);
    for (const questId of QUESTS) {
      await playQuest(page, questId);
    }
    await expect(page.getByTestId('sticker-shelf')).toContainText('جشن');
  });

  test('a wrong choice re-demonstrates instead of failing the child', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('trail-quest-greeting').click();
    await page.getByTestId('start-quest').click();
    await page.getByTestId('advance-intro').click();
    await page.getByTestId('advance-demonstrate').click();
    const step = getQuestDefinition('quest-greeting').steps[0]!;
    const wrong = step.choiceIconIds.find((icon) => icon !== step.correctIconId)!;
    await page.getByTestId(`choice-${wrong}`).click();
    await expect(page.getByTestId('retry-response')).toBeVisible();
    await page.getByTestId('retry-response').click();
    await expect(page.getByTestId('encounter-demonstrate')).toBeVisible();
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
  });

  test('progress survives a refresh', async ({ page }) => {
    await startGame(page);
    await playQuest(page, 'quest-greeting');
    await page.reload();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
    await expect(page.getByTestId('trail-quest-helping')).toBeEnabled();
  });

  test('a completed chapter can be replayed while offline', async ({ page, context }) => {
    await startGame(page);
    await playQuest(page, 'quest-greeting');
    // Wait for the service worker to finish precaching before cutting the network.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null || true);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await playQuest(page, 'quest-greeting');
    await context.setOffline(false);
  });

  test('a device without WebGL still plays through the DOM fallback', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patched(
        this: HTMLCanvasElement,
        id: string,
        ...rest: unknown[]
      ) {
        if (id === 'webgl' || id === 'webgl2' || id === 'experimental-webgl') return null;
        return (
          original as (this: HTMLCanvasElement, id: string, ...rest: unknown[]) => unknown
        ).call(this, id, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await startGame(page);
    await expect(page.getByTestId('webgl-fallback')).toBeVisible();
    await expect(page.getByTestId('quest-trail')).toBeVisible();
  });
});
