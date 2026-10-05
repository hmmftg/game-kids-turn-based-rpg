import { expect, test, type Page } from '@playwright/test';
import { STATIC_WORLD_SOURCE } from '../src/world/worldSource.ts';
import { getAnchor } from '../src/world/navigation/graph.ts';
import { startGame } from './harness.ts';
import { tapWorldAnchor, waitForProbe, type WorldProbe } from './npcTap.ts';

// PR K navigation legibility: the tap→go chain must read physically to a
// child — the avatar visibly orients toward the chosen spot, the camera
// keeps the destination in frame while walking, an unreachable tap still
// earns an honest glance, and HUD chrome gaps never eat world taps.

async function probeAt(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldAt);
}

test.describe('navigation legibility', () => {
  test('the camera keeps the walk destination in frame', async ({ page }) => {
    await startGame(page);
    await waitForProbe(page);
    // anchor-path-west: a bare waypoint (no NPC figure or landmark sitting on
    // the tap point), visible from spawn on every supported framing.
    const west = getAnchor(STATIC_WORLD_SOURCE, 'anchor-path-west');
    const pt = await page.evaluate(
      ({ x, z }) => (window as unknown as WorldProbe).__worldToScreen!(x, z),
      { x: west.x, z: west.z },
    );
    const sizes = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    await page.mouse.click(pt.x, pt.y);
    let movingSamples = 0;
    let offscreenSamples = 0;
    for (let i = 0; i < 400; i++) {
      const [moving, at, p] = await page.evaluate(
        ({ x, z }) => [
          (window as unknown as WorldProbe).__worldMoving,
          (window as unknown as WorldProbe).__worldAt,
          (window as unknown as WorldProbe).__worldToScreen!(x, z),
        ],
        { x: west.x, z: west.z },
      );
      if (moving === true) {
        movingSamples += 1;
        if (!p || p.x < 0 || p.y < 0 || p.x > sizes.w || p.y > sizes.h) {
          offscreenSamples += 1;
        }
      } else if (at === 'anchor-path-west') {
        break;
      }
      await page.waitForTimeout(120);
    }
    expect(movingSamples).toBeGreaterThan(0);
    expect(offscreenSamples).toBe(0);
    await expect.poll(() => probeAt(page), { timeout: 30000 }).toBe('anchor-path-west');
  });

  test('a tap on unreachable ground turns the avatar toward it without walking', async ({
    page,
  }) => {
    await startGame(page);
    await waitForProbe(page);
    // Dead ground exists beyond the anchor mesh but never inside the spawn
    // framing in landscape — walk one hop south first, then pick whichever
    // verified >4u-from-every-anchor point is on screen in this layout
    // (west grass band in landscape, east garden fringe in portrait).
    await tapWorldAnchor(page, 'anchor-path-south');
    await expect.poll(() => probeAt(page), { timeout: 30000 }).toBe('anchor-path-south');
    const headingBefore = await page.evaluate(
      () => (window as unknown as WorldProbe).__worldHeading ?? 0,
    );
    const pt = await page.evaluate(() => {
      const candidates: Array<[number, number]> = [
        [-6, 5],
        [-6.25, 5.25],
        [-6.5, 4.5],
        [4.25, 5.5],
        [4.5, 5.5],
        [-5.75, 5.5],
      ];
      for (const [x, z] of candidates) {
        const p = (window as unknown as WorldProbe).__worldToScreen!(x, z);
        if (
          p &&
          p.x > 30 &&
          p.y > 60 &&
          p.x < window.innerWidth - 30 &&
          p.y < window.innerHeight - 90
        ) {
          return p;
        }
      }
      return null;
    });
    expect(pt, 'a dead-ground tap point must be on screen').not.toBeNull();
    await page.mouse.click(pt!.x, pt!.y);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as WorldProbe).__worldHeading ?? 0), {
        timeout: 5000,
      })
      .not.toBe(headingBefore);
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => [
      (window as unknown as WorldProbe).__worldAt,
      (window as unknown as WorldProbe).__worldMoving,
    ]);
    expect(after[0]).toBe('anchor-path-south');
    expect(after[1]).not.toBe(true);
  });

  test('quest-trail chrome gaps pass taps through to the world', async ({ page }) => {
    await startGame(page);
    await waitForProbe(page);
    // Find a canvas point the trail band visually covers but no chip sits on:
    // it must behave exactly like open ground.
    const pt = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#world-canvas canvas, .world canvas',
      );
      const trail = document.querySelector('.trail');
      if (!canvas || !trail) return null;
      const band = trail.getBoundingClientRect();
      for (let y = band.top + 4; y < band.bottom - 4; y += 6) {
        for (let x = band.left + 4; x < band.right - 4; x += 6) {
          const el = document.elementFromPoint(x, y);
          if (el === canvas || canvas.contains(el)) return { x, y };
        }
      }
      return null;
    });
    test.skip(pt === null, 'no pass-through point inside the trail band in this layout');
    await page.mouse.click(pt!.x, pt!.y);
    await expect.poll(() => probeAt(page), { timeout: 30000 }).not.toBe('anchor-square');
  });

  test('the park-hill chain is walkable from spawn on every layout', async ({ page }) => {
    test.setTimeout(240000);
    await startGame(page);
    // Regression for the portrait follow-camera skip: west hops used to
    // disappear under the quest-trail band before it passed taps through.
    await tapWorldAnchor(page, 'anchor-park-hill');
    await expect.poll(() => probeAt(page), { timeout: 30000 }).toBe('anchor-park-hill');
    await tapWorldAnchor(page, 'anchor-park');
    await expect.poll(() => probeAt(page), { timeout: 30000 }).toBe('anchor-park');
  });
});
