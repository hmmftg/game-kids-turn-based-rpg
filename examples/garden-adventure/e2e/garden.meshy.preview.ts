import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

interface LocalModelRecord {
  readonly id: string;
  readonly sourceSha256: string;
  readonly outputSha256: string;
  readonly metrics: {
    readonly triangles: number;
    readonly outputBytes: number;
  };
}

interface RenderedAssetStatus {
  readonly status: 'ready';
  readonly sha256: string;
  readonly triangles: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly drawCalls: number;
  readonly decodedGeometryBytes: number;
  readonly loadDurationMs: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
  readonly sceneDrawCalls: number;
  readonly sceneTriangles: number;
  readonly rendered: true;
}

const pilotRoot = resolve(process.env['WAYPOINT_MESHY_PILOT_DIR'] ?? '');
const screenshotRoot = resolve(
  process.env['WAYPOINT_MESHY_SCREENSHOT_DIR'] ??
    join(homedir(), 'Pictures', 'waypoint-meshy-pilot'),
);
const repoRoot = resolve(process.cwd(), '../..');
const records = JSON.parse(
  readFileSync(join(pilotRoot, 'asset-records.json'), 'utf8'),
) as readonly LocalModelRecord[];
const recordById = new Map(records.map((record) => [record.id, record]));
const captures: { file: string; sha256: string; viewport: string; assetIds: readonly string[] }[] =
  [];
const assetMeasurements: { readonly id: string; readonly metrics: RenderedAssetStatus }[] = [];
const frameTimingSamples: {
  readonly label: string;
  readonly renderer: string;
  readonly elapsedMs: number;
  readonly renderedFrames: number;
  readonly observedFps: number;
}[] = [];
const resourceSamples: {
  readonly label: string;
  readonly sample: {
    readonly mapId: 'village' | 'garden';
    readonly sceneGeneration: number;
    readonly activeAnchor: string;
    readonly pageViewport: { readonly width: number; readonly height: number };
    readonly canvasViewport: { readonly width: number; readonly height: number };
    readonly geometryCount: number;
    readonly textureCount: number;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly sampledAt: number;
  };
}[] = [];

type RendererResourceSnapshot = (typeof resourceSamples)[number]['sample'];

async function startWithEmptySave(page: Page) {
  await page.addInitScript(() => {
    const initializedKey = '__gardenMeshyPilotE2eInitialized';
    if (sessionStorage.getItem(initializedKey) === 'true') return;
    localStorage.removeItem('waypoint-rpg:garden-adventure:save');
    sessionStorage.setItem(initializedKey, 'true');
  });
}

function capturePath(fileName: string): string {
  const normalizedRelativePath = relative(repoRoot, screenshotRoot);
  if (
    normalizedRelativePath === '' ||
    (!normalizedRelativePath.startsWith(`..${sep}`) &&
      normalizedRelativePath !== '..' &&
      !isAbsolute(normalizedRelativePath))
  )
    throw new Error('Private pilot screenshots must be written outside the repository.');
  mkdirSync(screenshotRoot, { recursive: true });
  const realRepoRoot = realpathSync(repoRoot);
  const realScreenshotRoot = realpathSync(screenshotRoot);
  const realRelativePath = relative(realRepoRoot, realScreenshotRoot);
  if (
    realRelativePath === '' ||
    (!realRelativePath.startsWith(`..${sep}`) &&
      realRelativePath !== '..' &&
      !isAbsolute(realRelativePath))
  )
    throw new Error('Private pilot screenshots cannot resolve into the repository.');
  return join(screenshotRoot, fileName);
}

async function capture(
  page: Page,
  fileName: string,
  viewport: string,
  assetIds: readonly string[] = [],
  includeInterface = false,
) {
  const path = capturePath(fileName);
  if (includeInterface) {
    await page.screenshot({ path, animations: 'disabled' });
  } else {
    await page.getByTestId(/scene-(village|garden)/).screenshot({
      path,
      animations: 'disabled',
    });
  }
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  captures.push({
    file: fileName,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    viewport,
    assetIds,
  });
}

async function captureGardenCanvas(
  page: Page,
  fileName: string,
  viewport: string,
  assetIds: readonly string[],
) {
  const path = capturePath(fileName);
  await page.getByTestId('garden-canvas').screenshot({ path, animations: 'disabled' });
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  captures.push({
    file: fileName,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    viewport,
    assetIds,
  });
}

async function waitForScene(page: Page, mapId: 'village' | 'garden') {
  await expect(page.getByTestId(`scene-${mapId}`)).toBeVisible();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect
    .poll(() => page.evaluate((expected) => window.__gardenProbe?.activeMap === expected, mapId))
    .toBe(true);
}

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

async function waitForRenderedAsset(page: Page, assetId: string): Promise<RenderedAssetStatus> {
  const expected = recordById.get(assetId);
  expect(expected, `The private pilot catalog must contain ${assetId}`).toBeDefined();
  expect(expected?.sourceSha256).toBe(expected?.outputSha256);

  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as unknown as { __gardenMeshyAssets?: Record<string, unknown> })
            .__gardenMeshyAssets?.[id] ?? null,
        assetId,
      ),
    )
    .toMatchObject({ status: 'ready', rendered: true, meshCount: expect.any(Number) });

  const actual = await page.evaluate(
    (id) =>
      (window as unknown as { __gardenMeshyAssets?: Record<string, unknown> })
        .__gardenMeshyAssets?.[id] ?? null,
    assetId,
  );
  expect(actual).toMatchObject({
    sha256: expected?.outputSha256,
    triangles: expected?.metrics.triangles,
  });
  const metrics = actual as RenderedAssetStatus;
  expect(metrics.meshCount).toBeGreaterThan(0);
  expect(metrics.vertexCount).toBeGreaterThan(0);
  expect(metrics.drawCalls).toBeGreaterThan(0);
  expect(metrics.decodedGeometryBytes).toBeGreaterThan(0);
  expect(metrics.loadDurationMs).toBeGreaterThanOrEqual(0);
  expect(metrics.rendererGeometries).toBeGreaterThan(0);
  expect(metrics.sceneDrawCalls).toBeGreaterThan(0);
  expect(metrics.sceneTriangles).toBeGreaterThan(0);
  assetMeasurements.push({ id: assetId, metrics });
  return metrics;
}

async function measureBoundedWalk(page: Page, targetId: string, label: string) {
  const start = await page.evaluate(() => ({
    time: performance.now(),
    frames: window.__gardenProbe?.totalFrameCount ?? 0,
  }));
  const target = page.getByTestId(`target-${targetId}`);
  await target.click();
  await expect(target).toHaveAttribute('data-nearby', 'true');
  const end = await page.evaluate(() => ({
    time: performance.now(),
    frames: window.__gardenProbe?.totalFrameCount ?? 0,
  }));
  const elapsedMs = end.time - start.time;
  const renderedFrames = end.frames - start.frames;
  expect(elapsedMs).toBeGreaterThan(0);
  expect(renderedFrames).toBeGreaterThan(0);
  const sample = {
    label,
    renderer: 'Chromium ANGLE SwiftShader',
    elapsedMs,
    renderedFrames,
    observedFps: (renderedFrames * 1000) / elapsedMs,
  };
  frameTimingSamples.push(sample);
  return sample;
}

async function sampleRendererResources(
  page: Page,
  label: string,
  expectedMapId: 'village' | 'garden',
): Promise<RendererResourceSnapshot> {
  const snapshot = await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __gardenRendererResourceProbe?: { sample: () => RendererResourceSnapshot };
      }
    ).__gardenRendererResourceProbe;
    if (!probe) return null;
    const canvas = document.querySelector('canvas');
    const gardenProbe = (window as unknown as { __gardenProbe?: { activeAnchor: string } })
      .__gardenProbe;
    return {
      ...probe.sample(),
      activeAnchor: gardenProbe?.activeAnchor ?? '',
      pageViewport: { width: window.innerWidth, height: window.innerHeight },
      canvasViewport: {
        width: canvas?.clientWidth ?? 0,
        height: canvas?.clientHeight ?? 0,
      },
    };
  });
  expect(snapshot, 'The Garden renderer resource probe is unavailable.').not.toBeNull();
  expect(snapshot?.mapId).toBe(expectedMapId);
  expect(snapshot?.geometryCount).toBeGreaterThan(0);
  expect(snapshot?.drawCalls).toBeGreaterThan(0);
  expect(snapshot?.triangles).toBeGreaterThan(0);
  if (!snapshot) throw new Error('The Garden renderer resource probe returned no sample.');
  resourceSamples.push({ label, sample: snapshot });
  return snapshot;
}

function buildResourceComparisons() {
  const procedural = resourceSamples.find((entry) => entry.label === 'village-procedural');
  const meshy = resourceSamples.find((entry) => entry.label === 'village-initial');
  if (!procedural || !meshy) return [];
  return [
    {
      id: 'default-village-procedural-vs-meshy',
      baselineLabel: procedural.label,
      enhancedLabel: meshy.label,
      sameState: {
        mapId: procedural.sample.mapId,
        activeAnchor: procedural.sample.activeAnchor,
        pageViewport: procedural.sample.pageViewport,
        canvasViewport: procedural.sample.canvasViewport,
      },
      baseline: procedural.sample,
      enhanced: meshy.sample,
      deltaMeshyMinusProcedural: {
        geometryCount: meshy.sample.geometryCount - procedural.sample.geometryCount,
        textureCount: meshy.sample.textureCount - procedural.sample.textureCount,
        drawCalls: meshy.sample.drawCalls - procedural.sample.drawCalls,
        triangles: meshy.sample.triangles - procedural.sample.triangles,
      },
    },
  ];
}

async function writeScreenshotProvenance() {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  writeFileSync(
    capturePath('provenance.json'),
    `${JSON.stringify(
      {
        sourceCommit,
        browser: 'Chromium with ANGLE SwiftShader',
        assets: records.map(({ id, sourceSha256, outputSha256 }) => ({
          id,
          sourceSha256,
          outputSha256,
        })),
        captures,
        assetMeasurements,
        resourceSamples,
        resourceComparisons: buildResourceComparisons(),
        frameTimingSamples,
      },
      null,
      2,
    )}\n`,
  );
}

test('renders original Meshy models in Garden and preserves quest and encounter flows', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startWithEmptySave(page);

  await page.goto('/?assets=meshy');
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
  await waitForRenderedAsset(page, 'meshy-garden-fountain');
  await waitForRenderedAsset(page, 'meshy-garden-sage');
  await sampleRendererResources(page, 'village-initial', 'village');
  await measureBoundedWalk(page, 'fountain', 'mesh-enhanced-village-to-fountain');
  await capture(page, 'garden-meshy-village.png', '1440x900', [
    'meshy-garden-fountain',
    'meshy-garden-sage',
  ]);

  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await waitForRenderedAsset(page, 'meshy-garden-guardian');
  await waitForRenderedAsset(page, 'meshy-garden-shrine');
  const firstGardenResources = await sampleRendererResources(page, 'garden-first-entry', 'garden');
  await capture(page, 'garden-meshy-shrine.png', '1440x900', [
    'meshy-garden-guardian',
    'meshy-garden-shrine',
  ]);

  await interact(page, 'village-gate');
  await waitForScene(page, 'village');
  await waitForRenderedAsset(page, 'meshy-garden-fountain');
  await waitForRenderedAsset(page, 'meshy-garden-sage');
  await sampleRendererResources(page, 'village-return', 'village');
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await waitForRenderedAsset(page, 'meshy-garden-guardian');
  await waitForRenderedAsset(page, 'meshy-garden-shrine');
  const secondGardenResources = await sampleRendererResources(
    page,
    'garden-repeat-entry',
    'garden',
  );
  expect(secondGardenResources.geometryCount).toBe(firstGardenResources.geometryCount);
  expect(secondGardenResources.textureCount).toBe(firstGardenResources.textureCount);
  await interact(page, 'village-gate');
  await waitForScene(page, 'village');
  await waitForRenderedAsset(page, 'meshy-garden-fountain');
  await waitForRenderedAsset(page, 'meshy-garden-sage');
  await interact(page, 'seed-basket');
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد');
  await page.getByTestId('ending-close').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  const treeStatus = await waitForRenderedAsset(page, 'meshy-garden-blossom-tree');
  expect(treeStatus.rendered).toBe(true);
  await capture(page, 'garden-meshy-restored-tree.png', '1440x900', [
    'meshy-garden-blossom-tree',
    'meshy-garden-shrine',
  ]);

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForScene(page, 'garden');
  await capture(page, 'garden-meshy-mobile-portrait.png', '390x844', [
    'meshy-garden-blossom-tree',
    'meshy-garden-shrine',
  ]);

  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await waitForScene(page, 'garden');
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  await waitForRenderedAsset(page, 'meshy-garden-blossom-tree');
  expect(pageErrors).toEqual([]);
  await writeScreenshotProvenance();
});

test('the imported guardian remains part of the playable tactical encounter', async ({ page }) => {
  await startWithEmptySave(page);
  await page.goto('/?assets=meshy');
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
  await interact(page, 'traveler');
  await page.getByTestId('dialogue-choice-meet-traveler').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('نشانی روی سنگ پنهان است');
  await page.getByTestId('dialogue-choice-follow-light').click();
  await interact(page, 'garden-gate');
  await waitForScene(page, 'garden');
  await waitForRenderedAsset(page, 'meshy-garden-guardian');
  await interact(page, 'clue-stone');
  const guardianTarget = page.getByTestId('target-guardian');
  if ((await guardianTarget.getAttribute('data-nearby')) !== 'true') {
    await guardianTarget.click();
    await expect(guardianTarget).toHaveAttribute('data-nearby', 'true');
  }
  await captureGardenCanvas(page, 'garden-meshy-guardian-model.png', '1440x900', [
    'meshy-garden-guardian',
  ]);
  await guardianTarget.click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('بازی نوری دوستانه');
  await page.getByTestId('dialogue-choice-challenge-guardian').click();
  await expect(page.getByTestId('battle-board').locator('button')).toHaveCount(25);
  await capture(
    page,
    'garden-meshy-guardian-encounter.png',
    '1440x900',
    ['meshy-garden-guardian'],
    true,
  );
  await page.getByTestId('battle-cell-2-2').click();
  await expect(page.getByTestId('battle-statuses')).toContainText('گرده رنگین');
  await expect(page.getByTestId('battle-layer')).toBeVisible();
  await writeScreenshotProvenance();
});

test('captures the original procedural village without selecting Meshy pilot mode', async ({
  page,
}) => {
  await startWithEmptySave(page);
  const privateAssetRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/__meshy/pilot/')) privateAssetRequests.push(request.url());
  });
  await page.goto('/?rendererprobe=1');
  await expect(page).not.toHaveURL(/assets=meshy/);
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.frameCount ?? 0))
    .toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__gardenMeshyAssets)).toEqual({});
  expect(privateAssetRequests).toEqual([]);
  const proceduralResources = await sampleRendererResources(page, 'village-procedural', 'village');
  expect(proceduralResources.activeAnchor).toBe('village-square');
  const meshyResources = resourceSamples.find((entry) => entry.label === 'village-initial')?.sample;
  expect(meshyResources, 'The enhanced village sample must be measured first.').toBeDefined();
  expect(proceduralResources.pageViewport).toEqual(meshyResources?.pageViewport);
  expect(proceduralResources.canvasViewport).toEqual(meshyResources?.canvasViewport);
  expect(proceduralResources.activeAnchor).toBe(meshyResources?.activeAnchor);
  await capture(page, 'garden-procedural-village.png', '1440x900');
  await writeScreenshotProvenance();
});

test('a missing pilot route keeps procedural Garden fallbacks', async ({ page }) => {
  await startWithEmptySave(page);
  await page.route('**/__meshy/pilot/**', (route) => route.abort());
  await page.goto('/?assets=meshy');
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
  await expect(page.getByTestId('target-gardener')).toBeVisible();
  await expect(page.getByTestId('target-fountain')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__gardenMeshyAssets?.['meshy-garden-fountain']?.status))
    .toBe('error');
  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  await capture(page, 'garden-procedural-fallback.png', '1440x900');
  await writeScreenshotProvenance();
});

test('a same-length corrupted fountain GLB falls back and keeps its world interaction', async ({
  page,
}) => {
  await startWithEmptySave(page);
  const corruption = {
    originalBytes: 0,
    servedBytes: 0,
    originalSha256: '',
    servedSha256: '',
    requestUrl: '',
  };
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/__meshy/pilot/models/meshy-garden-fountain.glb', async (route) => {
    const response = await route.fetch();
    const original = await response.body();
    const corrupted = Buffer.from(original);
    const byteIndex = corrupted.length - 1;
    corrupted[byteIndex] = (corrupted[byteIndex] ?? 0) ^ 1;
    corruption.originalBytes = original.byteLength;
    corruption.servedBytes = corrupted.byteLength;
    corruption.originalSha256 = createHash('sha256').update(original).digest('hex');
    corruption.servedSha256 = createHash('sha256').update(corrupted).digest('hex');
    corruption.requestUrl = route.request().url();
    await route.fulfill({ response, body: corrupted });
  });

  await page.goto('/?assets=meshy');
  await page.getByTestId('garden-start').click();
  await waitForScene(page, 'village');
  await expect(page.getByTestId('target-fountain')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __gardenMeshyAssets?: Record<string, { status: string; message?: string }>;
            }
          ).__gardenMeshyAssets?.['meshy-garden-fountain'] ?? null,
      ),
    )
    .toMatchObject({ status: 'error', message: expect.stringContaining('SHA-256') });
  expect(corruption.originalBytes).toBeGreaterThan(0);
  expect(corruption.servedBytes).toBe(corruption.originalBytes);
  expect(corruption.servedSha256).not.toBe(corruption.originalSha256);
  expect(corruption.requestUrl).toContain('/__meshy/pilot/models/meshy-garden-fountain.glb');
  await interact(page, 'fountain');
  await expect(page.getByTestId('movement-status')).toContainText('آب‌نمای میدان');
  await capture(page, 'garden-corrupt-fountain-fallback.png', '1440x900');
  expect(pageErrors).toEqual([]);
  await writeScreenshotProvenance();
});
