import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';
import { enableWorldProbe, openQuestDialogue } from './npcTap.ts';

/**
 * PR C coverage: passive encounter beats auto-play, the only mandatory child
 * action is the object tap, and Mode B (`?kidtest=nocopy`) is completable
 * with zero rendered copy — the question is the pictographic ❓ card.
 */

const DB_NAME = 'mahalle-ye-mehrabani';
const SEEDED_PROFILE_ID = 'kid-seeded';

async function startGame(page: Page, url = '/') {
  await enableWorldProbe(page);
  await page.goto(url);
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

/**
 * Writes a profile with `completed` quests marked done into IndexedDB, then
 * reloads so the picker offers it — Mode-B prototypes skip the whole chain.
 */
async function seedCompletedQuests(page: Page, completed: QuestId[]) {
  await page.goto('/');
  await page.evaluate(
    async ({ done, dbName, profileId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(dbName, 1);
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
async function playSteps(page: Page, questId: QuestId) {
  for (const step of getQuestDefinition(questId).steps) {
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`scene-${step.correctIconId}`).click();
    // The 160ms press buffer keeps this step's card up briefly — wait for it
    // to leave before reading the next step's choice.
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
  }
}

/** The only mandatory action per step: wait for the choice, tap the object. */
async function playQuest(page: Page, questId: QuestId) {
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

test.describe('encounter pacing', () => {
  test('passive beats play themselves — no continue taps needed', async ({ page }) => {
    await startGame(page);
    await openQuestDialogue(page, 'quest-greeting');
    await page.getByTestId('start-quest').click();

    // Intro → demonstrate → playerChoice happen on their own.
    await expect(page.getByTestId('encounter-intro')).toBeVisible();
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
  });

  test('a reload during a passive beat resumes cleanly at the hub', async ({ page }) => {
    await startGame(page);
    await openQuestDialogue(page, 'quest-greeting');
    await page.getByTestId('start-quest').click();
    await expect(page.getByTestId('encounter-intro')).toBeVisible();

    await page.reload();
    await resumeFromPicker(page);
    // The encounter never persisted — the quest is simply still offered.
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
    await playQuest(page, 'quest-greeting');
  });

  test('a hidden tab pauses pacing; restoring resumes the current beat', async ({ page }) => {
    await startGame(page);
    await openQuestDialogue(page, 'quest-greeting');
    await page.getByTestId('start-quest').click();
    await expect(page.getByTestId('encounter-intro')).toBeVisible();

    // Hide: the pending advance must be cancelled, not fired in the dark.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('encounter-intro')).toBeVisible();

    // Visible again: the current beat restarts and plays through.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('mode B (kidtest=nocopy)', () => {
  test('an NPC conversation quest is completable with all copy hidden', async ({ page }) => {
    await startGame(page, '/?kidtest=nocopy');
    await openQuestDialogue(page, 'quest-greeting');
    await page.getByTestId('start-quest').click();

    // No rendered copy anywhere in the encounter.
    await expect(page.getByTestId('encounter-intro')).toBeVisible();
    await expect(page.locator('[data-testid^="encounter-"] .dialogue-card__text')).toHaveCount(0);
    await expect(page.locator('[data-testid^="encounter-"] .dialogue-card__speaker')).toHaveCount(
      0,
    );

    // The question is pictographic: ❓ card above the plain object strip.
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('scene-question')).toBeVisible();
    await expect(
      page.locator('#scene-choice-root .st-primary, .scene-strip .st-primary'),
    ).toHaveCount(0);

    await playSteps(page, 'quest-greeting');
    const dismiss = page.getByTestId('celebration-continue');
    if (
      await dismiss.waitFor({ state: 'visible', timeout: 8000 }).then(
        () => true,
        () => false,
      )
    ) {
      await dismiss.click();
    }
    await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
  });

  test('the kite pickup/give prototype is completable without copy', async ({ page }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
    ]);
    // Seeded profile is now active; swap into Mode B without losing it.
    await page.goto('/?kidtest=nocopy');
    await resumeFromPicker(page);

    await playQuest(page, 'quest-park-kite');
    await expect(page.getByTestId('trail-quest-park-kite')).toContainText('انجام شد');
  });

  test('the teacher prototype asks a new picture per step and never pre-highlights', async ({
    page,
  }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
      'quest-park-kite',
      'quest-river-shell',
      'quest-bread-errand',
    ]);
    await page.goto('/?kidtest=nocopy');
    await resumeFromPicker(page);

    await openQuestDialogue(page, 'quest-school-answer');

    // Same objects both steps, different asked thing: the question card must
    // carry the change, not a glowing answer.
    const steps = getQuestDefinition('quest-school-answer').steps;
    const asked: string[] = [];
    const correctX: number[] = [];
    await page.getByTestId('start-quest').click();
    for (const step of steps) {
      await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
      const question = page.getByTestId('scene-question');
      await expect(question).toBeVisible();
      asked.push((await question.locator('svg').getAttribute('data-element')) ?? 'none');
      expect(
        await page.locator('.scene-strip .st-primary').count(),
        'no answer may be pre-highlighted in Mode B',
      ).toBe(0);
      const box = await page.getByTestId(`scene-${step.correctIconId}`).boundingBox();
      correctX.push(box?.x ?? -1);
      await page.getByTestId(`scene-${step.correctIconId}`).click();
      // Wait for this step's card to leave before reading the next question.
      await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
    }

    // Instrumentation for the real-kid test: if a child kept tapping the same
    // screen position they would fail — the correct object must differ while
    // the question card flips book → ball.
    expect(asked).toEqual(['book', 'ball']);
    await test.info().attach('school-mode-b-positions.json', {
      body: JSON.stringify({ asked, correctX }),
      contentType: 'application/json',
    });

    const dismiss = page.getByTestId('celebration-continue');
    if (
      await dismiss.waitFor({ state: 'visible', timeout: 8000 }).then(
        () => true,
        () => false,
      )
    ) {
      await dismiss.click();
    }
    await expect(page.getByTestId('trail-quest-school-answer')).toContainText('انجام شد');
  });
});
