import { expect, test } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import {
  playQuest,
  playSteps,
  resumeFromPicker,
  seedCompletedQuests,
  startGame,
} from './harness.ts';
import { enableWorldProbe, openQuestDialogue } from './npcTap.ts';

/**
 * PR C coverage: passive encounter beats auto-play, the only mandatory child
 * action is the object tap, and Mode B (`?kidtest=nocopy`) is completable
 * with zero rendered copy — the question is the pictographic ❓ card.
 */

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

  test('the step-win beat shows the settled consequence, not a repeated card', async ({ page }) => {
    await startGame(page);
    await openQuestDialogue(page, 'quest-greeting');
    await page.getByTestId('start-quest').click();

    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    const step = getQuestDefinition('quest-greeting').steps[0]!;
    await page.getByTestId(`scene-${step.correctIconId}`).click();

    // The step-win beat keeps the consequence visibly at its destination —
    // the persistent "after" the child just caused — instead of re-showing
    // the same words with nothing new on screen.
    await expect(page.getByTestId('encounter-reinforce')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('encounter-reinforce').locator('[data-consequence]')).toHaveClass(
      /scene-consequence--settled/,
    );
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
    await expect(page.getByTestId('trail-quest-greeting')).toHaveAttribute(
      'aria-label',
      /انجام شد/,
    );
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
    await page.goto('/?kidtest=nocopy&research=0');
    await resumeFromPicker(page);

    await playQuest(page, 'quest-park-kite');
    await expect(page.getByTestId('trail-quest-park-kite')).toHaveAttribute(
      'aria-label',
      /انجام شد/,
    );
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
    await page.goto('/?kidtest=nocopy&research=0');
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
    await expect(page.getByTestId('trail-quest-school-answer')).toHaveAttribute(
      'aria-label',
      /انجام شد/,
    );
  });
});

test.describe('semantic consequence identity', () => {
  test('the consequence scene shows the same physical object the child tapped', async ({
    page,
  }) => {
    await startGame(page);
    await seedCompletedQuests(page, ['quest-greeting', 'quest-helping']);
    await openQuestDialogue(page, 'quest-tidying');
    await page.getByTestId('start-quest').click();

    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15000 });
    const step = getQuestDefinition('quest-tidying').steps[0]!; // icon-pick-up → leaf
    const chip = page.getByTestId(`scene-${step.correctIconId}`);
    // The choice chip itself renders the filled leaf glyph.
    await expect(chip.locator('[data-shape="leaf"]')).toBeVisible();
    await chip.click();

    // The thing that physically responds is the same leaf — not an abstract
    // ellipse or a different object.
    await expect(page.getByTestId('encounter-response')).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByTestId('encounter-response').locator('[data-shape="leaf"]'),
    ).toBeVisible();
  });
});
