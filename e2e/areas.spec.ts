import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';
import { NPC_DEFINITIONS, WORLD_AREAS } from '../src/world/registry.ts';
import {
  attentionProbe,
  enableWorldProbe,
  openQuestDialogue,
  playerAt,
  tapNpcFigure,
  waitForProbe,
  waitForWalkerIdle,
} from './npcTap.ts';

async function startGame(page: Page) {
  await enableWorldProbe(page);
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

test.describe('scalable world', () => {
  // QA §20: the world data carries several areas and substantially more NPCs,
  // and the child can leave and come back without losing anything.
  test('the world data holds multiple areas and more NPCs than the first slice', async ({
    page,
  }) => {
    expect(WORLD_AREAS.length).toBeGreaterThanOrEqual(5);
    expect(NPC_DEFINITIONS.length).toBeGreaterThanOrEqual(8);
    await startGame(page);
    await expect(page.getByTestId('quest-trail')).toBeVisible();
  });

  // Multi-beat dialogue + a stable-id branching choice, reached through the
  // quest trail (quest-greeting → neighbour): next advances beats, the choice jumps
  // to another node, and close returns to the hub.
  test('dialogue plays several beats and a branch choice without losing the quest offer', async ({
    page,
  }) => {
    await startGame(page);
    await openQuestDialogue(page, 'quest-greeting');

    // The quest offer stays visible on every beat — one tap, like before.
    await expect(page.getByTestId('start-quest')).toBeVisible();
    await page.getByTestId('dialogue-next').click();
    await expect(page.getByTestId('dialogue-choice-neighbour-choice-more')).toBeVisible();

    await page.getByTestId('dialogue-choice-neighbour-choice-more').click();
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();
    await expect(page.getByTestId('start-quest')).toHaveCount(0);

    await page.getByTestId('close-dialogue').click();
    await expect(page.getByTestId('npc-dialogue')).toHaveCount(0);
  });

  // Leaving to the picker and returning (and a reload) keeps progress and
  // brings the same world back — NPCs in inactive areas cost nothing while
  // away because the world is the same data, not per-NPC code.
  // The interaction contract a child asked for: walking near a person never
  // starts a conversation, and tapping outside a card always leaves it —
  // without the tap leaking through to the world.
  test('walking to an NPC only navigates; a tap outside the dialogue closes it', async ({
    page,
  }) => {
    await startGame(page);
    await waitForProbe(page);
    await page.getByTestId('trail-quest-greeting').click();
    await waitForWalkerIdle(page);

    // Arrival earns attention, not a card: no dialogue opened by itself.
    await expect(page.getByTestId('npc-dialogue')).toHaveCount(0);
    await expect
      .poll(async () => (await attentionProbe(page))?.npcId ?? null, { timeout: 15000 })
      .toBe('npc-neighbour');

    // Talking is the child's explicit choice — tap the figure.
    await tapNpcFigure(page, 'npc-neighbour');
    await expect(page.getByTestId('npc-dialogue')).toBeVisible();

    // A tap anywhere outside the card leaves the conversation and does not
    // move the child — the backdrop swallows the world tap beneath it.
    const standing = await playerAt(page);
    const gap = await page.evaluate(() => {
      const backdrop = document.querySelector('[data-testid="modal-backdrop"]');
      if (!backdrop) return null;
      const box = backdrop.getBoundingClientRect();
      for (let y = box.top + 8; y < box.bottom; y += 24) {
        for (let x = box.left + 8; x < box.right; x += 24) {
          if (document.elementFromPoint(x, y) === backdrop) return { x, y };
        }
      }
      return null;
    });
    expect(gap).not.toBeNull();
    await page.mouse.click(gap!.x, gap!.y);
    await expect(page.getByTestId('npc-dialogue')).toHaveCount(0);
    expect(await playerAt(page)).toBe(standing);
  });

  test('leaving and returning preserves progress across a reload', async ({ page }) => {
    await startGame(page);
    await openQuestDialogue(page, 'quest-greeting');
    await page.getByTestId('close-dialogue').click();

    await page.reload();
    await resumeFromPicker(page);
    await expect(page.getByTestId('quest-trail')).toBeVisible();
    await expect(page.getByTestId('trail-quest-greeting')).toBeEnabled();
  });

  /** Plays one quest through every encounter step, always choosing correctly. */
  async function playQuest(page: Page, questId: QuestId) {
    // The chip walks there; tapping the person opens the quest offer.
    await openQuestDialogue(page, questId);
    await page.getByTestId('start-quest').click();
    for (const step of getQuestDefinition(questId).steps) {
      await page.getByTestId('advance-intro').click();
      await page.getByTestId('advance-demonstrate').click();
      await page.getByTestId(`scene-${step.correctIconId}`).click();
      await page.getByTestId('advance-response').click();
      await page.getByTestId('advance-reinforce').click();
    }
    // The last reinforce closes the quest; the celebration overlay must be
    // dismissed before tapping onward.
    const dismiss = page.getByTestId('celebration-continue');
    const celebrated = await dismiss.waitFor({ state: 'visible', timeout: 2000 }).then(
      () => true,
      () => false,
    );
    if (celebrated) await dismiss.click();
    await expect(page.getByTestId(`trail-${questId}`)).toContainText('انجام شد');
  }

  // The expanded areas are playable: walking into each area through the quest
  // trail reaches a real NPC + offer, and every step is completed by tapping
  // the physical target — kite, fish, shell, bread, picture cards.
  test('each expanded area offers a concrete completable activity', async ({ page }) => {
    test.setTimeout(300000);
    await startGame(page);

    // The new area quests stay locked until the story reaches them.
    await expect(page.getByTestId('trail-quest-park-kite')).toBeDisabled();
    for (const questId of [
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
    ] as const) {
      await playQuest(page, questId);
    }

    // Park: pick the fallen kite, give it to Sara.
    await playQuest(page, 'quest-park-kite');
    // River: spot the fish, collect the shell, drop it in the fisher's basket.
    await playQuest(page, 'quest-river-shell');
    // Market: take the warm loaf from the baker, place it on the shop shelf.
    await playQuest(page, 'quest-bread-errand');
    // School: answer the teacher by tapping the right picture (book, then ball).
    await playQuest(page, 'quest-school-answer');

    // Progress persists across a reload — resume keeps every area done.
    await page.reload();
    await resumeFromPicker(page);
    for (const questId of [
      'quest-park-kite',
      'quest-river-shell',
      'quest-bread-errand',
      'quest-school-answer',
    ] as const) {
      await expect(page.getByTestId(`trail-${questId}`)).toContainText('انجام شد');
    }
  });
});
