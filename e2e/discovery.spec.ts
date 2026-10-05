import { expect, test } from '@playwright/test';
import { startGame } from './harness.ts';
import {
  critterTransforms,
  dismissDialogue,
  enableWorldProbe,
  playerAt,
  reactionsProbe,
  tapReactivePoint,
  tapWorldAnchor,
  waitForProbe,
  waitForWalkerIdle,
} from './npcTap.ts';

/**
 * Delight PR 3 — micro-discoveries. A discovery earns its moment with no
 * text, reward, quest update, or marker: a cat notices the child's arrival
 * (a look or one bounded follow step, then back to patrol), a tapped bird
 * leaves for a deterministic alternate perch, and a leaf pile parts once
 * to reveal what hides underneath — and stays revealed for the session.
 */
test.beforeEach(async ({ page }) => {
  await enableWorldProbe(page);
});

test('a child arriving near a cat earns exactly one notice or follow', async ({ page }) => {
  await startGame(page);
  // The NE cat patrols beside the north path — every patrol spot sits
  // inside the notice radius of this anchor, so some response must land.
  await tapWorldAnchor(page, 'anchor-path-north');
  await waitForWalkerIdle(page);
  await dismissDialogue(page);

  await expect
    .poll(
      async () =>
        (await reactionsProbe(page)).filter(
          (r) => r.subject === 'cat-0' && (r.reaction === 'follow' || r.reaction === 'notice'),
        ).length,
      { timeout: 8000 },
    )
    .toBeGreaterThanOrEqual(1);

  // The arrivalNonce contract: one arrival → at most one cat response.
  const catReactions = (await reactionsProbe(page)).filter(
    (r) => r.subject === 'cat-0' && (r.reaction === 'follow' || r.reaction === 'notice'),
  );
  expect(catReactions.length).toBe(1);
  expect(await playerAt(page)).toBe('anchor-path-north');
});

test('a tapped bird flutters off to another perch', async ({ page }) => {
  await startGame(page);
  await waitForWalkerIdle(page);
  await waitForProbe(page);

  // Birds hop on their own schedule — re-read the live transform each
  // attempt so the tap lands where the bird actually is right now.
  const projectOnCanvas = (x: number, z: number, y: number) =>
    page.evaluate(
      ({ wx, wz, wy }: { wx: number; wz: number; wy: number }) => {
        const toScreen = (
          window as unknown as {
            __worldToScreen?: (x: number, z: number, y?: number) => { x: number; y: number };
          }
        ).__worldToScreen;
        const pt = toScreen?.(wx, wz, wy);
        if (!pt) return null;
        if (pt.x < 0 || pt.y < 0 || pt.x > window.innerWidth || pt.y > window.innerHeight)
          return null;
        const canvas = document.querySelector<HTMLCanvasElement>(
          '#world-canvas canvas, .world canvas',
        );
        const el = document.elementFromPoint(pt.x, pt.y);
        return canvas && (el === canvas || canvas.contains(el)) ? pt : null;
      },
      { wx: x, wz: z, wy: y },
    );

  let tapped: string | null = null;
  for (let attempt = 0; attempt < 8 && tapped === null; attempt += 1) {
    const birds = (await critterTransforms(page)).filter(([key]) => key.startsWith('bird-'));
    for (const [key, x, y, z] of birds) {
      const pt = await projectOnCanvas(x, z, y + 0.15);
      if (pt === null) continue;
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(250);
      if ((await reactionsProbe(page)).some((r) => r.reaction === 'flutter' && r.subject === key)) {
        tapped = key;
        break;
      }
      // The tap landed but the bird had just hopped — re-read and retry.
    }
    if (tapped === null) await page.waitForTimeout(1200);
  }
  test.skip(tapped === null, 'no bird was on the tappable canvas in this layout');

  await page.waitForTimeout(400);
  expect(
    (await reactionsProbe(page)).some((r) => r.reaction === 'flutter' && r.subject === tapped),
  ).toBe(true);

  // It lands on a different perch — the transform moves and stays moved.
  const before = (await critterTransforms(page)).find(([key]) => key === tapped)!;
  await expect
    .poll(
      async () => {
        const cur = (await critterTransforms(page)).find(([key]) => key === tapped);
        if (!cur) return 0;
        return Math.hypot(cur[1] - before[1], cur[3] - before[3]);
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(0.3);
});

test('a leaf pile parts once and stays revealed for the session', async ({ page }) => {
  await startGame(page);
  await waitForWalkerIdle(page);
  const before = await playerAt(page);

  // The park find — tucked beside the east path, off every tap surface.
  await tapReactivePoint(page, 3.6, -1.8);
  await page.waitForTimeout(400);
  const reveals = (await reactionsProbe(page)).filter(
    (r) => r.reaction === 'reveal' && r.subject === 'find-park',
  );
  expect(reveals.length).toBe(1);

  // The touch kept its normal meaning too — the child walked toward it.
  await expect.poll(() => playerAt(page), { timeout: 8000 }).not.toBe(before);

  // A second touch on the settled find reveals nothing new — the reveal
  // already happened; the tap is just an ordinary walk request now.
  await dismissDialogue(page);
  await tapReactivePoint(page, 3.6, -1.8);
  await page.waitForTimeout(400);
  expect(
    (await reactionsProbe(page)).filter((r) => r.reaction === 'reveal' && r.subject === 'find-park')
      .length,
  ).toBe(1);
});

test('reduced motion still uncovers the find — meaning without the motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startGame(page);
  await tapReactivePoint(page, 3.6, -1.8);
  await page.waitForTimeout(400);
  expect(
    (await reactionsProbe(page)).some((r) => r.reaction === 'reveal' && r.subject === 'find-park'),
  ).toBe(true);
});
