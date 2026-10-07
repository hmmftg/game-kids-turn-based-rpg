import { test, expect } from '@playwright/test';
import { startGame } from './harness.ts';
import {
  tapWorldAnchor,
  worldPoints,
  playerAt,
  waitForWalkerIdle,
  walkToChallengeZone,
} from './npcTap.ts';

/**
 * PR N1 — the DOM accessibility route for world interactions: the same
 * people/critters as large buttons dispatching the same commands, plus
 * no-silent-failure taps on locked content.
 */

test.describe('nearby sheet — DOM route for figure taps', () => {
  test('lists real friends; a row talks exactly like the figure tap', async ({ page }) => {
    await startGame(page);

    await page.getByTestId('nearby-button').click();
    await expect(page.getByTestId('nearby-sheet')).toBeVisible();
    await expect(page.getByTestId('nearby-npc-elder')).toBeVisible();

    // The universal leave rule: a tap outside the sheet closes it.
    await page.mouse.click(10, 10);
    await expect(page.getByTestId('nearby-sheet')).toBeHidden();

    await page.getByTestId('nearby-button').click();
    await page.getByTestId('nearby-npc-elder').click();

    // Same result as tapping the elder's figure: walk + greet + dialogue.
    await expect(page.getByTestId('npc-dialogue')).toBeVisible({ timeout: 90000 });
    await expect(page.getByTestId('nearby-sheet')).toBeHidden();
  });

  test('the same route reaches the battle critter — same command path', async ({ page }) => {
    test.setTimeout(240000);
    await startGame(page);

    // The playful mouse lives in the Challenge Zone — walk in, then the
    // sheet lists it like any other friend on the map.
    await walkToChallengeZone(page);
    await page.getByTestId('nearby-button').click();
    const mouseRow = page.getByTestId('nearby-npc-playful-mouse');
    await expect(mouseRow).toBeVisible();
    await mouseRow.click();

    // A battle opponent tap is the launch — same as the figure tap.
    await expect(page.getByTestId('battle-scene')).toBeVisible({ timeout: 60000 });
  });
});

test.describe('no silent failures', () => {
  test('a locked hotspot falls through to the ground — the tap still walks', async ({ page }) => {
    test.setTimeout(180000);
    await startGame(page);

    // quest-helping (anchor-shop) is locked at a fresh game: its hotspot
    // used to swallow the tap into silence. Walk nearby so the hotspot is
    // on screen, then tap the hotspot's own ground point.
    await tapWorldAnchor(page, 'anchor-path-east');
    const shop = { x: 6, z: 0 };
    const pts = await worldPoints(page, shop.x, shop.z);
    test.skip(pts.length === 0, 'shop hotspot is offscreen in this layout');
    await page.mouse.click(pts[0]!.x, pts[0]!.y);

    // The tap now means ground again: the avatar walks onto the anchor.
    await waitForWalkerIdle(page, 60000);
    expect(await playerAt(page)).toBe('anchor-shop');
  });
});
