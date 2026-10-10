import { expect, test, type Page } from '@playwright/test';
import { QUEST_DEFINITIONS, getQuestDefinition } from '../src/domain/quests/definitions.ts';
import { enableWorldProbe, openQuestDialogue, expandTrail } from './npcTap.ts';

// The trail plays quests that live on the mounted map; secondary maps (the
// cave) are reached through the world, not the trail — covered by cave.spec.
const QUESTS = QUEST_DEFINITIONS.filter((quest) => (quest.mapId ?? 'map-town') === 'map-town').map(
  (quest) => quest.id,
);

async function startGame(page: Page, avatar: 'avatar-aban' | 'avatar-arta' = 'avatar-aban') {
  await enableWorldProbe(page);
  await page.goto('/?research=0');
  await page.getByTestId('start-button').click();
  await page.getByTestId(avatar).click();
  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

/** Returning devices land on «کی بازی می‌کند؟» — pick the first card. */
async function resumeFromPicker(page: Page) {
  await expect(page.getByTestId('profile-select')).toBeVisible();
  await page.locator('[data-testid^="profile-card-"]').first().click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

/** Plays one quest through every encounter step, always choosing correctly. */
async function playQuest(page: Page, questId: (typeof QUESTS)[number]) {
  // The chip is navigation only — the child taps the NPC to talk.
  await openQuestDialogue(page, questId);
  await page.getByTestId('start-quest').click();

  // Passive beats auto-play — the only mandatory action is the scene tap.
  for (const step of getQuestDefinition(questId).steps) {
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`scene-${step.correctIconId}`).click();
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
  }
  // The last reinforce closes the quest and returns to the hub with a new
  // sticker; the celebration overlay must be dismissed before tapping onward.
  const dismiss = page.getByTestId('celebration-continue');
  const celebrated = await dismiss.waitFor({ state: 'visible', timeout: 8000 }).then(
    () => true,
    () => false,
  );
  if (celebrated) await dismiss.click();
  await expandTrail(page);
  await expect(page.getByTestId(`trail-${questId}`)).toContainText('انجام شد');
}

test.describe('vertical slice', () => {
  test('first run reaches the hub and the first chapter is the only open one', async ({ page }) => {
    await startGame(page);
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-helping')).toBeDisabled();
    await expandTrail(page);
    await expect(page.getByTestId('quest-trail')).toBeVisible();
  });

  test('both avatars play identically', async ({ page }) => {
    await startGame(page, 'avatar-arta');
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
    await playQuest(page, 'quest-greeting');
  });

  test('all town quests and the cooperative finale can be completed in order', async ({ page }) => {
    // The chain grew from 3 to 8 quests after the area activities — each one
    // still plays through every encounter phase in order; passive beats add
    // ~4 s per step on top of the walking time.
    test.setTimeout(300000);
    await startGame(page);
    for (const questId of QUESTS) {
      await playQuest(page, questId);
    }
    await expect(page.getByTestId('sticker-sticker-finale')).toBeVisible();
  });

  test('a wrong choice re-demonstrates instead of failing the child', async ({ page }) => {
    await startGame(page);
    await openQuestDialogue(page, 'quest-greeting');
    await page.getByTestId('start-quest').click();
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    const step = getQuestDefinition('quest-greeting').steps[0]!;
    const wrong = step.choiceIconIds.find((icon) => icon !== step.correctIconId)!;
    await page.getByTestId(`scene-${wrong}`).click();
    await expect(page.getByTestId('encounter-response')).toBeVisible();
    // Re-demonstration plays on its own — no retry tap to continue.
    await expect(page.getByTestId('encounter-demonstrate')).toBeVisible({ timeout: 10000 });
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
  });

  test('progress survives a refresh', async ({ page }) => {
    await startGame(page);
    await playQuest(page, 'quest-greeting');
    await page.reload();
    await resumeFromPicker(page);
    // Hydrating the persisted 'questCompleted' checkpoint is not a fresh win:
    // the celebration must not replay after a reload.
    await expect(page.getByTestId('quest-celebration')).toHaveCount(0);
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-helping')).toBeEnabled();
  });

  test('a completed chapter can be replayed while offline', async ({ page, context }) => {
    await startGame(page);
    await playQuest(page, 'quest-greeting');
    // Wait for the precaching service worker to become ACTIVE before cutting
    // the network — `ready` resolves once install (precache) completes.
    // (controller stays null on the registering page with clientsClaim off.)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await context.setOffline(true);
    await page.reload();
    await resumeFromPicker(page);
    await playQuest(page, 'quest-greeting');
    await context.setOffline(false);
  });

  test('two siblings keep separate progress on one device', async ({ page }) => {
    test.setTimeout(120000);
    await startGame(page, 'avatar-aban');
    await playQuest(page, 'quest-greeting');

    // Kid2 registers from the picker via pause → switch player.
    await page.getByTestId('pause-button').click();
    await page.getByTestId('switch-player').click();
    await expect(page.getByTestId('profile-select')).toBeVisible();
    await page.getByTestId('profile-new').click();
    await page.getByTestId('avatar-arta').click();
    await page.getByTestId('headwear-next').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).not.toContainText('انجام شد');

    // Back to the picker: kid1's card restores exactly their progress.
    await page.getByTestId('pause-button').click();
    await page.getByTestId('switch-player').click();
    await expect(page.locator('[data-testid^="profile-card-"]')).toHaveCount(2);
    await page.locator('[data-testid^="profile-card-"]').first().click();
    await expandTrail(page);
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
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
    await expandTrail(page);
    await expect(page.getByTestId('quest-trail')).toBeVisible();
  });
});
