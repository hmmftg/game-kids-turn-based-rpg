import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';
import { getAnchor } from '../src/world/navigation/graph.ts';
import type { AnchorId } from '../src/domain/game/types.ts';
import { openQuestDialogue } from './npcTap.ts';

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
  await page.getByTestId('badge-0').click();
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

/** Taps the world point (wx, wz) — resolves through the canvas like a finger. */
async function tapWorld(page: Page, anchorId: AnchorId) {
  // The probe hooks attach when the canvas is created — wait for them first.
  await page.waitForFunction(
    () => (window as unknown as WorldProbe).__worldToScreen !== undefined,
    undefined,
    { timeout: 30000 },
  );
  const anchor = getAnchor(anchorId);
  // HUD overlays (quest trail, dialogs) can sit over the canvas at the anchor's
  // projected pixel. Nudge around nearby world points until the hit lands on
  // the canvas itself — a real child's tap only ever reaches the canvas.
  const point = await page.evaluate(
    ({ ax, az }: { ax: number; az: number }) => {
      const toScreen = (window as unknown as WorldProbe).__worldToScreen!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#world-canvas canvas, .world canvas',
      );
      if (!canvas) return null;
      const offsets: Array<[number, number]> = [
        [0, 0],
        [0, -0.8],
        [0.8, -0.4],
        [-0.8, -0.4],
        [0.6, 0.6],
        [-0.6, 0.6],
        [0, 1.2],
      ];
      for (const [ox, oz] of offsets) {
        const pt = toScreen(ax + ox, az + oz);
        const el = document.elementFromPoint(pt.x, pt.y);
        if (el === canvas || canvas.contains(el)) return pt;
      }
      return null;
    },
    { ax: anchor.x, az: anchor.z },
  );
  test.skip(
    point === null,
    `${anchorId} is outside the tappable canvas in this layout — cave traversal is covered in landscape`,
  );
  await page.mouse.click(point!.x, point!.y);
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
  for (const step of getQuestDefinition(questId).steps) {
    await page.getByTestId('advance-intro').click();
    await page.getByTestId('advance-demonstrate').click();
    await page.getByTestId(`scene-${step.correctIconId}`).click();
    await page.getByTestId('advance-response').click();
    await page.getByTestId('advance-reinforce').click();
  }
  const dismiss = page.getByTestId('celebration-continue');
  const celebrated = await dismiss.waitFor({ state: 'visible', timeout: 2000 }).then(
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
    await tapWorld(page, 'anchor-cave-entrance');
    await waitForAnchor(page, 'anchor-cave-entrance');
    await expect.poll(() => probe(page).discoveries()).toEqual(['discovery-cave-entrance']);
    expect(await probe(page).mapId()).toBe('map-town');

    // Tapping the now-open entrance walks in: the cave map mounts instead.
    await tapWorld(page, 'anchor-cave-entrance');
    await waitForMap(page, 'map-cave');
    await expect(page.getByTestId('hud')).toBeVisible();

    // Inside, the way out is the bright arch at the mouth — back to the exact
    // outdoor entrance, never reset to the town square.
    await tapWorld(page, 'anchor-cave-mouth');
    await waitForMap(page, 'map-town');
    await waitForAnchor(page, 'anchor-cave-entrance');

    // Re-entering skips the discovery beat — the entrance is already known.
    await tapWorld(page, 'anchor-cave-entrance');
    await waitForMap(page, 'map-cave');

    // A reload restores the cave exactly: same map, same local spawn.
    await page.reload();
    await resumeFromPicker(page);
    await waitForMap(page, 'map-cave');
  });

  test('the cave quest completes inside the cave', async ({ page }) => {
    test.setTimeout(300000);
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
    await tapWorld(page, 'anchor-cave-entrance'); // walk to the rock
    await waitForAnchor(page, 'anchor-cave-entrance');
    await expect.poll(() => probe(page).discoveries()).toEqual(['discovery-cave-entrance']);
    await tapWorld(page, 'anchor-cave-entrance'); // step through the doorway
    await waitForMap(page, 'map-cave');

    // Now the trail target works: it walks to the cave mouse and plays the
    // two-step crystal quest entirely inside the cave.
    await playQuest(page, 'quest-cave-crystal');
    expect(await probe(page).mapId()).toBe('map-cave');

    // Leaving returns to the park entrance with the quest still done.
    await tapWorld(page, 'anchor-cave-mouth');
    await waitForMap(page, 'map-town');
    await page.reload();
    await resumeFromPicker(page);
    await expect(page.getByTestId('trail-quest-cave-crystal')).toContainText('انجام شد');
  });
});
