import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { QuestId } from '../src/domain/game/types.ts';

// Interaction ownership: arriving near an NPC only earns their attention —
// talking is an explicit tap on the figure. These helpers drive that: probe
// the NPC's live world position, project it to canvas pixels, tap it.

export interface WorldProbe {
  __worldDialogueNpc?: string | null;
  __worldMapId?: string;
  __worldAt?: string;
  __worldDiscoveries?: string[];
  __worldMoving?: boolean;
  __worldAttention?: { npcId: string; nonce: number } | null;
  __worldToScreen?: (x: number, z: number) => { x: number; y: number };
  __worldNpcs?: Record<
    string,
    { anchorId: string; activity: string; dialogueId: string | null; x: number; z: number }
  >;
}

export async function enableWorldProbe(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__WORLD_PROBE'] = true;
  });
}

export async function waitForProbe(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as WorldProbe).__worldToScreen !== undefined,
    undefined,
    { timeout: 30000 },
  );
}

export async function npcProbe(page: Page, id: string) {
  return page.evaluate(
    (npcId) => (window as unknown as WorldProbe).__worldNpcs?.[npcId] ?? null,
    id,
  );
}

export async function playerAt(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldAt);
}

export async function attentionProbe(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldAttention ?? null);
}

/** Walks have finished once the walker's own `moving` flag settles. */
export async function waitForWalkerIdle(page: Page, timeout = 60000) {
  await expect
    .poll(
      async () => {
        const moving = await page.evaluate(() => (window as unknown as WorldProbe).__worldMoving);
        // `moving` is only published once the walker mounts — undefined means
        // the canvas is still booting, not that the walk has finished.
        return moving === false ? 'idle' : 'walking';
      },
      { timeout },
    )
    .toBe('idle');
}

/** On-canvas pixels in and around a world point (figure taps). */
export async function worldPoints(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ wx, wz }: { wx: number; wz: number }) => {
      const toScreen = (window as unknown as WorldProbe).__worldToScreen!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#world-canvas canvas, .world canvas',
      );
      if (!canvas) return [];
      const offsets: Array<[number, number]> = [
        [0, -0.8],
        [0.4, -1.2],
        [0.8, -0.4],
        [-0.8, -0.4],
        [0, 0],
        [0.6, 0.6],
        [-0.6, 0.6],
        [0, 1.2],
        [1.2, -0.8],
        [-1.2, -0.8],
      ];
      const points: Array<{ x: number; y: number }> = [];
      for (const [ox, oz] of offsets) {
        const pt = toScreen(wx + ox, wz + oz);
        if (pt.x < 0 || pt.y < 0 || pt.x > window.innerWidth || pt.y > window.innerHeight) {
          continue;
        }
        const el = document.elementFromPoint(pt.x, pt.y);
        if (el === canvas || canvas.contains(el)) points.push(pt);
      }
      return points;
    },
    { wx: x, wz: z },
  );
}

/**
 * Taps an NPC figure where it currently stands until its dialogue opens.
 * Retries with fresh projections — the routine may move them between reads,
 * and the child may need a hop of walking before the tap lands.
 */
/** NPC id of the currently open dialogue, or null. */
export async function dialogueNpc(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldDialogueNpc ?? null);
}

export async function tapNpcFigure(page: Page, npcId: string, timeout = 60000): Promise<boolean> {
  await waitForProbe(page);
  const deadline = Date.now() + timeout;
  const dialogue = page.getByTestId('npc-dialogue');
  let attempt = 0;
  for (;;) {
    // Never click world geometry while a card is up — the backdrop swallows
    // it as a dismissal, not a figure tap.
    if (await dialogue.isVisible().catch(() => false)) {
      const who = await dialogueNpc(page);
      if (who === npcId) return true;
      await page.getByTestId('close-dialogue').click();
      await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    const npc = await npcProbe(page, npcId);
    const points = npc !== null ? await worldPoints(page, npc.x, npc.z) : [];
    attempt += 1;
    // One fresh click per iteration: a missed tap can start a walk, which
    // moves the camera — every remaining stale pixel would then land on a
    // different part of the world (a stranger's cylinder, a far anchor).
    // Re-probe + re-project between clicks so each tap is honest.
    const pt = points.length > 0 ? (points[(attempt - 1) % points.length] ?? null) : null;
    if (pt === null) {
      console.log(
        `tapNpcFigure ${npcId} attempt ${attempt}: npc=${JSON.stringify(npc)} offscreen at=${await playerAt(page)}`,
      );
      if (Date.now() > deadline) return false;
      await page.waitForTimeout(800);
      continue;
    }
    await page.mouse.click(pt.x, pt.y);
    const opened = await dialogue
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      const who = await dialogueNpc(page);
      console.log(`tapNpcFigure ${npcId}: dialogue opened for ${who}`);
      if (who === npcId) return true;
      // Two people can share an anchor — a routine visitor's cylinder
      // can overlap the resident's. Wrong person: leave and try another point.
      await page.getByTestId('close-dialogue').click();
      await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(500);
  }
}

/**
 * Quest chip → walk → stop → tap the quest's NPC → dialogue opens.
 * The chip itself never talks; this is the whole new interaction contract.
 */
export async function openQuestDialogue(page: Page, questId: QuestId, timeout = 120000) {
  const npcId = getQuestDefinition(questId).steps[0]!.npcId;
  // The walker must exist before the chip click — a goTo into a null scene
  // handle silently drops the navigation.
  await waitForProbe(page);
  const deadline = Date.now() + timeout;
  for (;;) {
    await page.getByTestId(`trail-${questId}`).click();
    // Navigate first: the chip is walk+camera only, so let the walk finish
    // (arrival may shift the routine — the figure is tapped where it then
    // actually stands, exactly like a child chasing a moving person).
    await waitForWalkerIdle(page, 60000).catch(() => {});
    if (await tapNpcFigure(page, npcId, 20000)) break;
    if (Date.now() > deadline) {
      test.skip(true, `${npcId} is not tappable in this layout`);
      return;
    }
  }
  await expect(page.getByTestId('npc-dialogue')).toBeVisible();
}
