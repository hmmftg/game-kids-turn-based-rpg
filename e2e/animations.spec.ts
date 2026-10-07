import { expect, test, type Page } from '@playwright/test';
import type { QuestId } from '../src/domain/game/types.ts';
import { resumeFromPicker, seedCompletedQuests, startGame } from './harness.ts';
import {
  enableWorldProbe,
  openQuestDialogue,
  tapNpcFigure,
  waitForWalkerIdle,
  type WorldProbe,
} from './npcTap.ts';

/**
 * PR F storyboard: every semantic episode is a physical state transition —
 * verb → consequence — with at most one contextual character reaction.
 * `__worldAnimationEvents` is engineering instrumentation only; the real-child
 * discoverability gate stays separate. The storyboard also proves liveness:
 * `__worldAnimationStats.active` returns to 0 after the episode ends.
 */

type AnimationEvent = NonNullable<WorldProbe['__worldAnimationEvents']>[number];
type EventSummary = Pick<AnimationEvent, 'type' | 'subjectId' | 'actorId' | 'context'>;

const EARLY_QUESTS: readonly QuestId[] = [
  'quest-greeting',
  'quest-helping',
  'quest-tidying',
  'quest-finale',
];

const TOWN_QUESTS: readonly QuestId[] = [
  ...EARLY_QUESTS,
  'quest-park-kite',
  'quest-river-shell',
  'quest-bread-errand',
];

const MODE_B_URL = '/?kidtest=nocopy,noactionicons&research=0';

async function resetAnimations(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as WorldProbe;
    w.__worldAnimationEvents = [];
    // `active`/`completed` are derived getters — drop the object so the next
    // recorded episode recreates them rather than writing plain fields.
    w.__worldAnimationStats = undefined;
  });
}

async function animationEvents(page: Page): Promise<AnimationEvent[]> {
  return page.evaluate(() => [...((window as unknown as WorldProbe).__worldAnimationEvents ?? [])]);
}

function summarize(events: readonly AnimationEvent[]): EventSummary[] {
  return events.map(({ type, subjectId, actorId, context }) => ({
    type,
    subjectId,
    actorId,
    context,
  }));
}

async function expectEpisode(page: Page, expected: readonly EventSummary[]) {
  await expect
    .poll(async () => summarize(await animationEvents(page)), { timeout: 5000 })
    .toEqual([...expected]);
  // The boundary is the semantic episode, not celebration/HUD decoration:
  // by the time the child could act again, no semantic instance may remain.
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as unknown as WorldProbe).__worldAnimationStats?.active ?? 0),
      { timeout: 10000 },
    )
    .toBe(0);
}

async function startSeededModeB(page: Page, completed: readonly QuestId[]) {
  await enableWorldProbe(page);
  await seedCompletedQuests(page, [...completed]);
  await page.goto(MODE_B_URL);
  await resumeFromPicker(page);
}

test.describe('semantic animation storyboard', () => {
  test('arrival earns notices-child; tapping the figure earns greets-child', async ({ page }) => {
    await startGame(page, MODE_B_URL);

    await resetAnimations(page);
    // Quest chip navigates only: walking to where the elder stands earns the
    // physical arrival acknowledgement — never a dialogue and never a ring.
    await page.getByTestId('trail-quest-greeting').click();
    await waitForWalkerIdle(page, 60000);
    await expectEpisode(page, [
      {
        type: 'character-react',
        subjectId: 'npc-neighbour',
        actorId: undefined,
        context: 'notices-child',
      },
    ]);

    await resetAnimations(page);
    // The greeting is parallel with the tap/walk/dialogue — no gated cue.
    await tapNpcFigure(page, 'npc-elder', 30000);
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();
    await expectEpisode(page, [
      {
        type: 'character-react',
        subjectId: 'npc-elder',
        actorId: undefined,
        context: 'greets-child',
      },
    ]);
  });

  test('kite pickup: ObjectLift then ObjectFlyTo the child hand', async ({ page }) => {
    await startSeededModeB(page, EARLY_QUESTS);
    await openQuestDialogue(page, 'quest-park-kite');
    await page.getByTestId('start-quest').click();
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });

    await resetAnimations(page);
    await page.getByTestId('scene-icon-pick-kite').click();
    await expect(page.getByTestId('encounter-response')).toBeVisible();
    await expectEpisode(page, [
      { type: 'object-lift', subjectId: 'kite', actorId: undefined, context: undefined },
      {
        type: 'object-fly-to',
        subjectId: 'kite',
        actorId: 'player',
        context: undefined,
      },
    ]);
  });

  test('give kite: the held kite flies to Sara and she receives it', async ({ page }) => {
    await startSeededModeB(page, EARLY_QUESTS);
    await openQuestDialogue(page, 'quest-park-kite');
    await page.getByTestId('start-quest').click();

    // Step 0 creates the real held-kite state; step 1 is the destination
    // consequence this scenario measures.
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('scene-icon-pick-kite').click();
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });

    await resetAnimations(page);
    await page.getByTestId('scene-icon-give-kite').click();
    await expect(page.getByTestId('encounter-response')).toBeVisible();
    await expectEpisode(page, [
      {
        type: 'object-fly-to',
        subjectId: 'kite',
        actorId: 'npc-child-sara',
        context: undefined,
      },
      {
        type: 'character-react',
        subjectId: 'npc-child-sara',
        actorId: undefined,
        context: 'receives-kite',
      },
    ]);
  });

  test('shell to basket: ObjectFlyTo ends in authoritative ObjectReceive', async ({ page }) => {
    await startSeededModeB(page, [...EARLY_QUESTS, 'quest-park-kite']);
    await openQuestDialogue(page, 'quest-river-shell');
    await page.getByTestId('start-quest').click();

    // Steps 0–1 create the real held-shell state; the third step is the
    // destination consequence this scenario measures.
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('scene-icon-spot-fish').click();
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('scene-icon-collect-shell').click();
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });

    await resetAnimations(page);
    await page.getByTestId('scene-icon-give-shell').click();
    await expect(page.getByTestId('encounter-response')).toBeVisible();
    await expectEpisode(page, [
      {
        type: 'object-fly-to',
        subjectId: 'shell',
        actorId: 'basket',
        context: undefined,
      },
      {
        type: 'object-receive',
        subjectId: 'basket',
        actorId: undefined,
        context: undefined,
      },
    ]);
  });

  test('book answer: ObjectOpen(book) plus one looks-at-book reaction', async ({ page }) => {
    await startSeededModeB(page, TOWN_QUESTS);
    await openQuestDialogue(page, 'quest-school-answer');
    await page.getByTestId('start-quest').click();
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });

    await resetAnimations(page);
    await page.getByTestId('scene-icon-tap-book').click();
    await expect(page.getByTestId('encounter-response')).toBeVisible();
    await expectEpisode(page, [
      { type: 'object-open', subjectId: 'book', actorId: undefined, context: undefined },
      {
        type: 'character-react',
        subjectId: 'npc-teacher',
        actorId: undefined,
        context: 'looks-at-book',
      },
    ]);
  });

  test('wrong pick: questioning only — no success, held, or destination events', async ({
    page,
  }) => {
    await startSeededModeB(page, TOWN_QUESTS);
    await openQuestDialogue(page, 'quest-school-answer');
    await page.getByTestId('start-quest').click();
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });

    await resetAnimations(page);
    // The ball is present as a plausible distractor while the book is asked.
    await page.getByTestId('scene-icon-tap-ball').click();
    const response = page.getByTestId('encounter-response');
    await expect(response).toBeVisible();
    await expect(response.locator('[data-reaction="questioning"]')).toHaveCount(1);
    await expect(response.locator('.scene-consequence')).toHaveCount(0);
    await expectEpisode(page, [
      {
        type: 'character-react',
        subjectId: 'npc-teacher',
        actorId: undefined,
        context: 'questioning',
      },
    ]);
  });

  test('noactionicons keeps the book distractor scene physical and strips affordances', async ({
    page,
  }) => {
    await startSeededModeB(page, TOWN_QUESTS);
    await openQuestDialogue(page, 'quest-school-answer');
    await page.getByTestId('start-quest').click();
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });

    // The meaningful discovery test needs plausible things nearby: the book
    // and ball stay visible and tappable while every abstract cue is gone.
    await expect(page.getByTestId('scene-icon-tap-book')).toBeVisible();
    await expect(page.getByTestId('scene-icon-tap-ball')).toBeVisible();
    await expect(page.getByTestId('scene-icon-turn-back')).toHaveCount(0);
    await expect(page.locator('.scene-question')).toBeVisible();
    await expect(page.locator('.scene-question__mark')).toHaveCount(0);
    await expect(page.locator('.scene-target__ring')).toHaveCount(0);
    await expect(page.locator('.scene-held svg [data-element="hand"]')).toHaveCount(0);
    await expect(page.locator('.trail__badge')).toHaveCount(0);
    await expect(page.locator('.trail__emoji')).toHaveCount(0);
    await expect(page.locator('.objective__emoji')).toHaveCount(0);
    await expect(page.locator('.objective__text')).toHaveCount(0);
    await expect(page.locator('[data-testid^="encounter-"] .dialogue-card__text')).toHaveCount(0);
  });
});
