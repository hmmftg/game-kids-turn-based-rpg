import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';
import { openQuestDialogue, tapWorldAnchor } from './npcTap.ts';

// The cave is reached by tapping the world, not by a button — these specs tap
// real canvas pixels via the world probe (enabled by __WORLD_PROBE before load).

async function startGame(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__WORLD_PROBE'] = true;
  });
  await page.goto('/');
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

async function resumeFromPicker(page: Page) {
  await expect(page.getByTestId('profile-select')).toBeVisible();
  await page.locator('[data-testid^="profile-card-"]').first().click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

interface WorldProbe {
  __worldMapId?: string;
  __worldAt?: string;
  __worldDiscoveries?: string[];
  __worldToScreen?: (x: number, z: number) => { x: number; y: number };
}

function probe(page: Page) {
  const read = () =>
    page.evaluate(() => {
      const w = window as unknown as WorldProbe;
      return {
        __worldMapId: w.__worldMapId,
        __worldAt: w.__worldAt,
        __worldDiscoveries: w.__worldDiscoveries,
      };
    });
  return {
    mapId: () => read().then((w) => w.__worldMapId),
    at: () => read().then((w) => w.__worldAt),
    discoveries: () => read().then((w) => w.__worldDiscoveries),
  };
}

async function waitForMap(page: Page, mapId: string) {
  await expect.poll(() => probe(page).mapId(), { timeout: 30000 }).toBe(mapId);
}

async function waitForAnchor(page: Page, anchorId: string) {
  // Walks across the whole town can take a while at the child's pace.
  await expect.poll(() => probe(page).at(), { timeout: 60000 }).toBe(anchorId);
}

/** Plays one quest through every encounter step, always choosing correctly. */
async function playQuest(page: Page, questId: QuestId) {
  // The chip walks to the quest's anchor; tapping the resident opens the
  // offer — same ownership rule underground as in town.
  await openQuestDialogue(page, questId);
  await page.getByTestId('start-quest').click();
  // Passive beats auto-play — the only mandatory action is the scene tap.
  for (const step of getQuestDefinition(questId).steps) {
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`scene-${step.correctIconId}`).click();
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
  }
  const dismiss = page.getByTestId('celebration-continue');
  const celebrated = await dismiss.waitFor({ state: 'visible', timeout: 8000 }).then(
    () => true,
    () => false,
  );
  if (celebrated) await dismiss.click();
  await expect(page.getByTestId(`trail-${questId}`)).toContainText('انجام شد');
}

test.describe('the hidden cave', () => {
  test('the secret rock opens once and the cave exits to the same spot', async ({ page }) => {
    test.setTimeout(120000);
    await startGame(page);
    await waitForMap(page, 'map-town');

    // First arrival at the rock reveals the entrance — the child stays outside
    // while the doorway appears (a discovered fact, not a door that teleports).
    await tapWorldAnchor(page, 'anchor-cave-entrance');
    await waitForAnchor(page, 'anchor-cave-entrance');
    await expect.poll(() => probe(page).discoveries()).toEqual(['discovery-cave-entrance']);
    expect(await probe(page).mapId()).toBe('map-town');

    // Tapping the now-open entrance walks in: the cave map mounts instead.
    await tapWorldAnchor(page, 'anchor-cave-entrance');
    await waitForMap(page, 'map-cave');
    await expect(page.getByTestId('hud')).toBeVisible();

    // Inside, the way out is the bright arch at the mouth — back to the exact
    // outdoor entrance, never reset to the town square.
    await tapWorldAnchor(page, 'anchor-cave-mouth');
    await waitForMap(page, 'map-town');
    await waitForAnchor(page, 'anchor-cave-entrance');

    // Re-entering skips the discovery beat — the entrance is already known.
    await tapWorldAnchor(page, 'anchor-cave-entrance');
    await waitForMap(page, 'map-cave');

    // A reload restores the cave exactly: same map, same local spawn.
    await page.reload();
    await resumeFromPicker(page);
    await waitForMap(page, 'map-cave');
  });

  test('the cave quest completes inside the cave', async ({ page }) => {
    // Full unlock chain (8 quests) + cave traversal + passive beats.
    test.setTimeout(480000);
    await startGame(page);

    // The cave quest unlocks after the school answer — play the story there.
    for (const questId of [
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
      'quest-park-kite',
      'quest-river-shell',
      'quest-bread-errand',
      'quest-school-answer',
    ] as const) {
      await playQuest(page, questId);
    }

    // In town the cave quest is off-map (locked on the trail); the child
    // enters through the discovered entrance instead.
    await expect(page.getByTestId('trail-quest-cave-crystal')).toBeDisabled();
    await tapWorldAnchor(page, 'anchor-cave-entrance'); // walk to the rock
    await waitForAnchor(page, 'anchor-cave-entrance');
    await expect.poll(() => probe(page).discoveries()).toEqual(['discovery-cave-entrance']);
    await tapWorldAnchor(page, 'anchor-cave-entrance'); // step through the doorway
    await waitForMap(page, 'map-cave');

    // Now the trail target works: it walks to the cave mouse and plays the
    // two-step crystal quest entirely inside the cave.
    await playQuest(page, 'quest-cave-crystal');
    expect(await probe(page).mapId()).toBe('map-cave');

    // Leaving returns to the park entrance with the quest still done.
    await tapWorldAnchor(page, 'anchor-cave-mouth');
    await waitForMap(page, 'map-town');
    await page.reload();
    await resumeFromPicker(page);
    await expect(page.getByTestId('trail-quest-cave-crystal')).toContainText('انجام شد');
  });
});
