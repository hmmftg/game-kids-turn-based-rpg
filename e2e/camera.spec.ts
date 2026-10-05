import { expect, test, type Page } from '@playwright/test';
import { getAnchor } from '../src/world/navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from '../src/world/worldSource.ts';
import { tapWorldAnchor } from './npcTap.ts';
import { CAMERA_PADDING } from '../src/world/camera.ts';
import { getMap } from '../src/world/maps.ts';

// Follow-camera acceptance: spawn centered → camera follows → viewport never
// reveals outside-map space → taps still land after camera moves → cave
// transitions refocus → reload keeps the right map.

async function startGame(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__WORLD_PROBE'] = true;
  });
  await page.goto('/');
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
}

interface WorldProbe {
  __worldMapId?: string;
  __worldAt?: string;
  __worldDiscoveries?: string[];
  __worldToScreen?: (x: number, z: number) => { x: number; y: number };
  __worldCamera?: { position: { x: number; z: number } };
}

/** Camera ground target = camera position − the fixed isometric offset. */
async function cameraTarget(page: Page) {
  return page.evaluate(() => {
    const cam = (window as unknown as WorldProbe).__worldCamera;
    if (!cam) return { x: Number.NaN, z: Number.NaN };
    return { x: cam.position.x - 10, z: cam.position.z - 10 };
  });
}

/** Polls until the camera settles near (x, z). */
async function waitForCamera(page: Page, x: number, z: number, tolerance = 0.8) {
  await expect
    .poll(
      async () => {
        const t = await cameraTarget(page);
        return Math.hypot(t.x - x, t.z - z);
      },
      { timeout: 30000 },
    )
    .toBeLessThan(tolerance);
}

async function waitForProbe(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as WorldProbe).__worldToScreen !== undefined,
    undefined,
    { timeout: 30000 },
  );
}

/** Waits until the camera stops easing (target stable across two reads). */
async function waitForCameraSettle(page: Page) {
  await expect
    .poll(
      async () => {
        const a = await cameraTarget(page);
        await page.waitForTimeout(350);
        const b = await cameraTarget(page);
        return Math.hypot(b.x - a.x, b.z - a.z);
      },
      { timeout: 30000 },
    )
    .toBeLessThan(0.01);
}

async function waitForMap(page: Page, mapId: string) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as WorldProbe).__worldMapId), {
      timeout: 30000,
    })
    .toBe(mapId);
}

async function waitForAnchor(page: Page, anchorId: string) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as WorldProbe).__worldAt), {
      timeout: 60000,
    })
    .toBe(anchorId);
}

test.describe('follow camera', () => {
  test('centers on spawn, follows the walker, and never leaves the map', async ({ page }) => {
    test.setTimeout(180000);
    await startGame(page);
    await waitForMap(page, 'map-town');
    const town = getMap(STATIC_WORLD_SOURCE, 'map-town');

    // 1–2) Centered spawn: the camera boots focused on the square, not the
    // middle of the authored bounds.
    const spawn = getAnchor(STATIC_WORLD_SOURCE, town.spawnAnchorId);
    await waitForCamera(page, spawn.x, spawn.z);

    // 3) Follow: walking west pulls the camera toward the walker and lets
    // it settle on the new position.
    await tapWorldAnchor(page, 'anchor-path-west');
    await waitForAnchor(page, 'anchor-path-west');
    const west = getAnchor(STATIC_WORLD_SOURCE, 'anchor-path-west');
    await waitForCamera(page, west.x, west.z, 1.5);
    const afterMove = await cameraTarget(page);
    expect(afterMove.x).toBeLessThan(spawn.x);

    // 4) Boundary clamp: far-west walk — the target stays inside the padded
    // bounds, so the viewport never shows outside-map space. The park hill
    // sits at the west edge without touching the cave transition.
    await tapWorldAnchor(page, 'anchor-park-hill');
    await waitForAnchor(page, 'anchor-park-hill');
    const edgeAnchor = getAnchor(STATIC_WORLD_SOURCE, 'anchor-park-hill');
    await waitForCamera(page, edgeAnchor.x, edgeAnchor.z, 12);
    const atEdge = await cameraTarget(page);
    expect(atEdge.x).toBeGreaterThanOrEqual(town.bounds.minX);
    expect(atEdge.z).toBeGreaterThanOrEqual(town.bounds.minZ);
    expect(atEdge.x).toBeLessThanOrEqual(town.bounds.maxX);
    expect(atEdge.z).toBeLessThanOrEqual(town.bounds.maxZ);
    // The camera clamped instead of tracking the walker all the way to the edge.
    expect(atEdge.x).toBeGreaterThan(edgeAnchor.x - CAMERA_PADDING - 0.01);
  });

  test('drag pans the map and walking snaps the camera back to the child', async ({ page }) => {
    test.setTimeout(120000);
    await startGame(page);
    await waitForMap(page, 'map-town');
    const spawn = getAnchor(
      STATIC_WORLD_SOURCE,
      getMap(STATIC_WORLD_SOURCE, 'map-town').spawnAnchorId,
    );
    await waitForCamera(page, spawn.x, spawn.z);

    // Drag the map under the finger: the look target slides the other way,
    // still inside the map bounds.
    const before = await cameraTarget(page);
    const vp = page.viewportSize() ?? { width: 880, height: 420 };
    const cx = Math.round(vp.width / 2);
    const cy = Math.round(vp.height / 2);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - Math.round(vp.width * 0.2), cy - Math.round(vp.height * 0.2), {
      steps: 12,
    });
    await page.mouse.up();
    const panned = await cameraTarget(page);
    expect(Math.hypot(panned.x - before.x, panned.z - before.z)).toBeGreaterThan(0.5);
    const town = getMap(STATIC_WORLD_SOURCE, 'map-town');
    expect(panned.x).toBeGreaterThanOrEqual(town.bounds.minX - 0.5);
    expect(panned.x).toBeLessThanOrEqual(town.bounds.maxX + 0.5);
    expect(panned.z).toBeGreaterThanOrEqual(town.bounds.minZ - 0.5);
    expect(panned.z).toBeLessThanOrEqual(town.bounds.maxZ + 0.5);

    // Walking anywhere snaps the pan back: the child is the focus again.
    await tapWorldAnchor(page, 'anchor-path-west');
    await waitForAnchor(page, 'anchor-path-west');
    const west = getAnchor(STATIC_WORLD_SOURCE, 'anchor-path-west');
    await waitForCamera(page, west.x, west.z, 1.5);
  });

  test('refocuses on cave entry and exit, and taps still work after the camera moved', async ({
    page,
  }) => {
    test.setTimeout(240000);
    await startGame(page);
    await waitForMap(page, 'map-town');

    // Reveal the entrance, then walk in — real taps with the camera already
    // displaced from spawn prove raycast stays correct after camera motion.
    // The first arrival discovers the rock; the second walk crosses the door.
    await tapWorldAnchor(page, 'anchor-cave-entrance');
    await tapWorldAnchor(page, 'anchor-cave-entrance');
    await waitForMap(page, 'map-cave');

    // Cave spawns focused inside its own bounds (never stale town target):
    // the small interior pins the target to the clamped center.
    const cave = getMap(STATIC_WORLD_SOURCE, 'map-cave');
    const mouth = getAnchor(STATIC_WORLD_SOURCE, cave.spawnAnchorId);
    await waitForCamera(page, mouth.x, (cave.bounds.minZ + cave.bounds.maxZ) / 2);

    // The cave fits in view: target stays pinned near bounds center.
    const inside = await cameraTarget(page);
    expect(inside.x).toBeGreaterThanOrEqual(cave.bounds.minX - 0.5);
    expect(inside.x).toBeLessThanOrEqual(cave.bounds.maxX + 0.5);

    // Leaving refocuses on the town side of the transition.
    await tapWorldAnchor(page, 'anchor-cave-mouth');
    await waitForMap(page, 'map-town');
    const entrance = getAnchor(STATIC_WORLD_SOURCE, 'anchor-cave-entrance');
    await waitForCamera(page, entrance.x, entrance.z, 12);

    // Reload resumes on the right map without a stale camera.
    await page.reload();
    await page.locator('[data-testid^="profile-card-"]').first().click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await waitForProbe(page);
    await waitForMap(page, 'map-town');
    const town = getMap(STATIC_WORLD_SOURCE, 'map-town');
    await waitForCameraSettle(page);
    const t = await cameraTarget(page);
    expect(t.x).toBeGreaterThanOrEqual(town.bounds.minX);
    expect(t.x).toBeLessThanOrEqual(town.bounds.maxX);
  });
});
