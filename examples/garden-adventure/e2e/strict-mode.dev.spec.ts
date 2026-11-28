import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function start(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.getByTestId('garden-start')).toBeVisible();
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect(page.getByTestId('scene-village')).toBeVisible();
}

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

function capturePageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectModelDraw(
  page: Page,
  instanceId: string,
  expected: {
    assetId: string;
    status: 'ready' | 'error';
    failure?: string;
    render: {
      mapId: 'village' | 'garden';
      source: 'asset' | 'fallback';
      boneCount: number;
      semanticAction: 'idle' | null;
    };
  },
) {
  const read = () => page.evaluate((id) => window.__gardenBundledModels?.[id], instanceId);
  await expect.poll(read).toMatchObject(expected);
  const model = await read();
  expect(model?.render?.frame).toBeGreaterThan(0);
  expect(model?.render?.vertexCount).toBeGreaterThan(0);
  expect(model?.render?.drawCalls).toBeGreaterThan(0);
}

test('development Strict Mode draws the bundled static and rigged GLB meshes', async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await start(page, '?modelprobe=1');

  await expectModelDraw(page, 'garden-hero', {
    assetId: 'phase5-animated-guardian',
    status: 'ready',
    render: { mapId: 'village', source: 'asset', boneCount: 2, semanticAction: 'idle' },
  });
  await interact(page, 'garden-gate');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expectModelDraw(page, 'garden-guardian', {
    assetId: 'phase5-animated-guardian',
    status: 'ready',
    render: { mapId: 'garden', source: 'asset', boneCount: 2, semanticAction: 'idle' },
  });
  await expectModelDraw(page, 'garden-lantern-base', {
    assetId: 'phase5-textured-static',
    status: 'ready',
    render: { mapId: 'garden', source: 'asset', boneCount: 0, semanticAction: null },
  });
  expect(pageErrors).toEqual([]);
});

test('development Strict Mode draws the procedural landmark after a bundled GLB fails integrity', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await page.route('**/models/phase5-textured-static.glb', async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    // Keep the response status and length so the loader reaches SHA-256 validation.
    const lastByte = body.length - 1;
    body.writeUInt8(body.readUInt8(lastByte) ^ 1, lastByte);
    await route.fulfill({ response, body });
  });
  await start(page, '?modelprobe=1');
  await interact(page, 'garden-gate');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expectModelDraw(page, 'garden-lantern-base', {
    assetId: 'phase5-textured-static',
    status: 'error',
    failure: 'Asset phase5-textured-static SHA-256 does not match its approved record.',
    render: { mapId: 'garden', source: 'fallback', boneCount: 0, semanticAction: null },
  });
  expect(pageErrors).toEqual([]);
});

async function reachTreeEnding(page: Page) {
  await start(page, '?cinematicprobe=1');
  await interact(page, 'gardener');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await interact(page, 'seed-basket');
  await interact(page, 'garden-gate');
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toBeVisible();
}

async function expectVisibleTreeCue(page: Page) {
  const dialogueCue = page
    .getByRole('status')
    .filter({ hasText: 'باغ با مراقبت و دوستی جان گرفت' });
  await expect(dialogueCue).toBeVisible();
  await expect(dialogueCue).toHaveAttribute('aria-live', 'polite');
  await expect(dialogueCue).toHaveAttribute('data-cinematic-dialogue', 'tree-ending');
}

async function cameraDisplacement(page: Page) {
  return page.evaluate(() => {
    const probe = window.__gardenEndingCinematicProbe;
    if (!probe) return NaN;
    return Math.hypot(
      probe.cameraPosition[0] - probe.initialCameraPosition[0],
      probe.cameraPosition[1] - probe.initialCameraPosition[1],
      probe.cameraPosition[2] - probe.initialCameraPosition[2],
    );
  });
}

async function expectCinematicSettled(page: Page, status: 'completed' | 'cancelled') {
  await expect
    .poll(() => page.evaluate(() => window.__gardenEndingCinematicProbe))
    .toMatchObject({ endingId: 'ending-garden', status });
  expect(await cameraDisplacement(page)).toBeLessThan(0.01);
}

test('development Strict Mode presents the accessible ending cue and restores the camera', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await reachTreeEnding(page);
  await expectVisibleTreeCue(page);
  await expect.poll(() => cameraDisplacement(page)).toBeGreaterThan(1);
  await expectCinematicSettled(page, 'completed');
  expect(pageErrors).toEqual([]);
});

test('development Strict Mode cancels the ending cinematic when the recap closes', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await reachTreeEnding(page);
  await expect.poll(() => cameraDisplacement(page)).toBeGreaterThan(1);
  await page.getByTestId('ending-close').click();
  await expect(page.getByTestId('ending-panel')).toHaveCount(0);
  await expectCinematicSettled(page, 'cancelled');
  expect(pageErrors).toEqual([]);
});

test('development Strict Mode keeps the Persian cue visible after reduced-motion completion', async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachTreeEnding(page);
  await expectCinematicSettled(page, 'completed');
  await expectVisibleTreeCue(page);
  expect(pageErrors).toEqual([]);
});
