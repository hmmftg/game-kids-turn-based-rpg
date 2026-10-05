import { expect, test } from '@playwright/test';
import { resumeFromPicker, seedCompletedQuests, startGame } from './harness.ts';
import {
  attentionProbe,
  enableWorldProbe,
  factDecorationsProbe,
  tapWorldAnchor,
  waitForWalkerIdle,
} from './npcTap.ts';

/**
 * Delight Pass PR 4 — fact-derived world reactions. The world "remembers"
 * without storing any memory: a completed quest is already in the save, and
 * presentation resolves from it. Proof point: `quest-bread-errand` done →
 * the baker waves hello (greets-child, not the neutral notices-child) and a
 * bread crate stands beside the bakery — on every visit, after every
 * reload. Undone → the ordinary world.
 *
 * The bakery is far enough from spawn to be off-canvas on the tight
 * portrait viewport, and the quest hotspot sits ON `anchor-bakery`, so the
 * tests walk progressively (`tapWorldAnchor` taps ground mid-points —
 * ordinary walking taps, never the hotspot itself).
 */

test.describe('fact-derived world memory', () => {
  test('a finished errand warms the baker — wave on approach + bread crate stays', async ({
    page,
  }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, ['quest-bread-errand']);
    await page.goto('/');
    await resumeFromPicker(page);

    // The crate was earned before this session even began — already there.
    expect(await factDecorationsProbe(page)).toContain('deco-bakery-bread');

    await tapWorldAnchor(page, 'anchor-bakery');
    await waitForWalkerIdle(page);

    const attention = await attentionProbe(page);
    expect(attention?.npcId).toBe('npc-baker');
    expect(attention?.context).toBe('greets-child');
  });

  test('without the errand the baker only notices — no wave, no crate', async ({ page }) => {
    await startGame(page);

    expect(await factDecorationsProbe(page)).toEqual([]);

    await tapWorldAnchor(page, 'anchor-bakery');
    await waitForWalkerIdle(page);

    const attention = await attentionProbe(page);
    expect(attention?.npcId).toBe('npc-baker');
    expect(attention?.context).toBe('notices-child');
  });
});
