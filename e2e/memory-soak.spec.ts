import { test, expect, type Page } from '@playwright/test';
import { startGame } from './harness.ts';

/**
 * Memory soak: the surfaces that remount the world (pause/parent → canvas
 * unmount; the Nearby sheet) must not leak scene nodes, GPU geometries,
 * textures, programs, or DOM canvases across repeated cycles.
 *
 * Baseline is taken after one warm-up cycle — first-use resources that are
 * legitimately cached for the session's life must not count as leaks. What
 * must hold: counts at the end of N identical cycles return to that
 * baseline within a small slack.
 */
test.describe('memory soak — remount cycles stay bounded', () => {
  test.setTimeout(240000);
  // Probes (__worldDisposeEvents, __worldCritterTimersAtUnmount, renderer
  // info) are dev-only or gated behind __WORLD_PROBE; e2e runs `vite preview`
  // (a production build), so the flag must be set before the app loads.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__WORLD_PROBE'] = true;
    });
  });

  interface WorldProbe {
    __worldScene?: { traverse: (fn: () => void) => void };
    __worldRenderer?: {
      info: {
        memory: { geometries: number; textures: number };
        programs?: unknown[];
      };
    };
  }

  const snapshot = async (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as WorldProbe;
      let nodes = 0;
      w.__worldScene?.traverse(() => {
        nodes += 1;
      });
      const info = w.__worldRenderer?.info;
      return {
        canvases: document.querySelectorAll('canvas').length,
        domNodes: document.getElementsByTagName('*').length,
        sceneNodes: nodes,
        geometries: info?.memory.geometries ?? -1,
        textures: info?.memory.textures ?? -1,
        programs: info?.programs?.length ?? -1,
      };
    });

  const cycle = async (page: Page) => {
    // Pause unmounts the whole Canvas; resume remounts it.
    await page.getByTestId('pause-button').click();
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('pause-menu')).toBeHidden();
    // Nearby sheet: opens and dismisses DOM + resolves stands again.
    await page.getByTestId('nearby-button').click();
    await expect(page.getByTestId('nearby-sheet')).toBeVisible();
    await page.getByTestId('nearby-backdrop').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('nearby-sheet')).toBeHidden();
  };

  test('five remount cycles return to the warmed-up baseline', async ({ page }) => {
    await startGame(page);
    // Warm-up: first-use caches (shared geometries/materials/programs) are
    // session-lifetime resources, not leaks.
    await cycle(page);
    await page.waitForTimeout(500);
    const base = await snapshot(page);

    for (let i = 0; i < 5; i += 1) await cycle(page);
    await page.waitForTimeout(500);
    const end = await snapshot(page);

    expect(end.canvases).toBe(1);
    // The scene must not accumulate nodes across remounts.
    expect(end.sceneNodes).toBeLessThanOrEqual(base.sceneNodes + 5);
    // GPU resource counts are shared/cached — at most a couple of late
    // first-uses may land after the warm-up; unbounded growth is the bug.
    expect(end.geometries).toBeLessThanOrEqual(base.geometries + 2);
    expect(end.textures).toBeLessThanOrEqual(base.textures + 2);
    expect(end.programs).toBeLessThanOrEqual(base.programs + 2);
    // DOM: the sheet/backdrop cycle must not strand nodes.
    expect(end.domNodes).toBeLessThanOrEqual(base.domNodes + 10);
  });

  test('unmount actually releases the old scene — counted dispose events', async ({ page }) => {
    await startGame(page);
    const disposeEvents = () =>
      page.evaluate(
        () => (window as unknown as { __worldDisposeEvents?: number }).__worldDisposeEvents ?? -1,
      );
    const critterTimersAtUnmount = () =>
      page.evaluate(
        () =>
          (window as unknown as { __worldCritterTimersAtUnmount?: number })
            .__worldCritterTimersAtUnmount ?? -1,
      );

    // Wait until the disposal registry is mounted before taking the baseline.
    await page.waitForFunction(
      () =>
        (window as unknown as { __worldDisposeEvents?: number }).__worldDisposeEvents !== undefined,
    );
    const before = await disposeEvents();
    // One remount cycle; the fresh renderer's gl.info alone cannot prove the
    // old scene released anything — real dispose events are the evidence.
    await cycle(page);
    const afterOne = await disposeEvents();
    expect(afterOne).toBeGreaterThan(before);
    // The critter scheduler must freeze fully on unmount: no pending timers.
    expect(await critterTimersAtUnmount()).toBe(0);

    // Within one mounted renderer, ordinary scene updates must not leak:
    // walk + a reactive tap + a full frame settle leaves disposal flat.
    const marker = await disposeEvents();
    await page.getByTestId('nearby-button').click();
    await page.getByTestId('nearby-backdrop').click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(500);
    expect(await disposeEvents()).toBe(marker);
  });
});
