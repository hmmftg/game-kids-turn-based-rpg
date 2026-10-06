import { expect, test } from '@playwright/test';
import { startGame } from './harness.ts';
import { dialogueNpc, npcProbe, tapNpcFigure, tapWorldAnchor, waitForProbe } from './npcTap.ts';

/**
 * The child-facing invariant behind the proximity hold (PR #61): the person
 * you walk up to stays the same person until you decide what to do.
 *
 * The fisher cycles river → bakery → river-bank. Her river and bank stands
 * both sit within ~3u of BOTH the river and river-bank anchors, so once she
 * is at either, ping-ponging between the two anchors ticks the world clock
 * while keeping her held. `anchor-river-path` is >3u from every one of her
 * stands — arriving there is "leaving", which releases the hold and lets the
 * schedule resume.
 */

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

const RIVER_ANCHORS = ['anchor-river', 'anchor-river-bank'] as const;

/** Hops until the fisher stands at river or bank — inside hold range. */
async function alignFisher(page: Parameters<typeof tapWorldAnchor>[0]) {
  for (let i = 0; i < 8; i += 1) {
    const npc = await npcProbe(page, 'npc-fisher');
    if (npc !== null && (npc.anchorId === 'anchor-river' || npc.anchorId === 'anchor-river-bank')) {
      return npc;
    }
    await tapWorldAnchor(page, RIVER_ANCHORS[i % RIVER_ANCHORS.length]!);
  }
  const npc = await npcProbe(page, 'npc-fisher');
  if (npc !== null && (npc.anchorId === 'anchor-river' || npc.anchorId === 'anchor-river-bank')) {
    return npc;
  }
  throw new Error('fisher never reached a river stand');
}

test.describe('NPC stability — the person you approach stays that person', () => {
  test('lingering beside her never relocates her; a later tap talks where she stands', async ({
    page,
  }) => {
    test.setTimeout(300000);
    await startGame(page);
    await waitForProbe(page);

    // Walk into the river area and wait until she is at a river-side stand.
    await tapWorldAnchor(page, 'anchor-river');
    const held = await alignFisher(page);
    const heldSpot = { anchorId: held.anchorId, x: held.x, z: held.z };

    // Linger: more arrivals near her tick the clock but must not move her.
    for (let i = 0; i < 3; i += 1) {
      await tapWorldAnchor(page, RIVER_ANCHORS[i % RIVER_ANCHORS.length]!);
      const now = await npcProbe(page, 'npc-fisher');
      expect(now).not.toBeNull();
      expect(now!.anchorId).toBe(heldSpot.anchorId);
      expect(dist(now!, heldSpot)).toBeLessThan(0.35);
    }

    // Waiting nearby produces no surprise relocation either.
    await page.waitForTimeout(2000);
    const afterWait = await npcProbe(page, 'npc-fisher');
    expect(afterWait!.anchorId).toBe(heldSpot.anchorId);

    // The tap after waiting still finds her — where the child sees her.
    const dialogueId = afterWait!.dialogueId;
    expect(await tapNpcFigure(page, 'npc-fisher')).toBe(true);
    expect(await dialogueNpc(page)).toBe('npc-fisher');
    const opened = await npcProbe(page, 'npc-fisher');
    expect(opened!.dialogueId).toBe(dialogueId);
  });

  test('leaving releases her — schedule resumes; returning re-holds her', async ({ page }) => {
    test.setTimeout(300000);
    await startGame(page);
    await waitForProbe(page);

    await tapWorldAnchor(page, 'anchor-river');
    const held = await alignFisher(page);
    const heldSpot = { x: held.x, z: held.z };

    // Leave: arrivals at river-path are out of her reach — the hold releases
    // and her schedule must visibly resume within a couple of ticks.
    let moved = false;
    for (let i = 0; i < 6 && !moved; i += 1) {
      await tapWorldAnchor(page, 'anchor-river-path');
      const now = await npcProbe(page, 'npc-fisher');
      moved = now !== null && dist(now, heldSpot) > 0.3;
    }
    expect(moved, 'schedule never resumed after leaving').toBe(true);

    // Return later: once she is back at a river-side stand, arrivals beside
    // her hold her again — the world keeps ticking, she just doesn't walk
    // away from a visitor.
    const reheld = await alignFisher(page);
    for (let i = 0; i < 2; i += 1) {
      await tapWorldAnchor(page, RIVER_ANCHORS[i % RIVER_ANCHORS.length]!);
      const now = await npcProbe(page, 'npc-fisher');
      expect(now!.anchorId).toBe(reheld.anchorId);
    }
  });
});
