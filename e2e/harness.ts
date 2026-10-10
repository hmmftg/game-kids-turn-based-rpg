import { expect, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';
import { enableWorldProbe, expandTrail, openQuestDialogue } from './npcTap.ts';

/** Shared golden-path helpers for e2e specs — importing a .spec file would
 *  register its tests, so reusable flow code lives here instead. */

const DB_NAME = 'mahalle-ye-mehrabani';
const SEEDED_PROFILE_ID = 'kid-seeded';

/** Research Session Mode is default-on — e2e opts out unless the spec is
 *  itself about research (an explicit research= in the URL wins). */
export const withoutResearch = (url: string): string =>
  url.includes('research=') ? url : `${url}${url.includes('?') ? '&' : '?'}research=0`;

export async function startGame(page: Page, url = '/') {
  await enableWorldProbe(page);
  await page.goto(withoutResearch(url));
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

export async function resumeFromPicker(page: Page) {
  await expect(page.getByTestId('profile-select')).toBeVisible();
  await page.locator('[data-testid^="profile-card-"]').first().click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

export { expandTrail };

/**
 * Writes a profile with `completed` quests marked done into IndexedDB, then
 * reloads so the picker offers it — Mode-B prototypes skip the whole chain.
 */
export async function seedCompletedQuests(page: Page, completed: QuestId[]) {
  await page.goto('/?research=0');
  await page.evaluate(
    async ({ done, dbName, profileId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        // No explicit version — opens whatever the app upgraded the DB to.
        const open = indexedDB.open(dbName);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('progress')) {
            open.result.createObjectStore('progress');
          }
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction('progress', 'readwrite');
      const store = tx.objectStore('progress');
      const now = Date.now();
      const quests: Record<string, unknown> = {};
      for (const id of done) {
        quests[id] = { status: 'completed', completedSteps: [], completionCount: 1 };
      }
      store.put(
        [
          {
            id: profileId,
            nameFa: '',
            avatarId: 'avatar-aban',
            badge: '🎈',
            headwear: 'none',
            createdAt: now,
            lastPlayedAt: now,
            stickerCount: done.length,
          },
        ],
        'profiles',
      );
      store.put(
        {
          schemaVersion: 2,
          avatarId: 'avatar-aban',
          quests,
          checkpoint: { kind: 'hub', questId: null, at: now },
          stickers: [],
          audio: { musicMuted: false, sfxMuted: false, musicVolume: 0.6, sfxVolume: 0.8 },
          qualityTier: 'medium',
          lastPlayedAt: now,
          discoveries: [],
          mapId: 'map-town',
          mapAnchorId: 'anchor-square',
        },
        `profile:${profileId}`,
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    { done: completed, dbName: DB_NAME, profileId: SEEDED_PROFILE_ID },
  );
  await page.reload();
  await resumeFromPicker(page);
}

/** Tap each step's correct object once the choice strip is up. */
export async function playSteps(page: Page, questId: QuestId) {
  for (const step of getQuestDefinition(questId).steps) {
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`scene-${step.correctIconId}`).click();
    // The 160ms press buffer keeps this step's card up briefly — wait for it
    // to leave before reading the next step's choice.
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
  }
}

/** The only mandatory action per step: wait for the choice, tap the object. */
export async function playQuest(page: Page, questId: QuestId) {
  await openQuestDialogue(page, questId);
  await page.getByTestId('start-quest').click();
  await playSteps(page, questId);
  const dismiss = page.getByTestId('celebration-continue');
  if (
    await dismiss.waitFor({ state: 'visible', timeout: 8000 }).then(
      () => true,
      () => false,
    )
  ) {
    await dismiss.click();
  }
}
