import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { preview } from 'vite';

const repositoryRoot = resolve(process.cwd(), '../..');
const outputDirectory = resolve(repositoryRoot, 'docs/previews/phase5');
const manifestPath = resolve(outputDirectory, 'provenance.json');
const screenshotNames = [
  '01-static-model.png',
  '02-two-rigged-characters.png',
  '03-moving-character.png',
  '04-character-interaction.png',
  '05-cinematic-camera.png',
  '06-cinematic-dialogue.png',
  '07-lantern-consequence.png',
  '08-reduced-motion.png',
  '09-mobile-portrait.png',
];
const errors = [];
const externalRequests = [];
let browser;
let server;

function watchPage(page, origin) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
}

async function waitForScene(page, mapId) {
  await page.waitForFunction(
    (expectedMap) =>
      document.querySelector('[data-testid="session-readiness"]')?.textContent === 'ready' &&
      document.querySelector('[data-testid="active-map"]')?.textContent === expectedMap &&
      document.querySelector('[data-testid="scene-canvas"]')?.isConnected === true &&
      (window.__sceneProbe?.frameCount ?? 0) > 0 &&
      (window.__sceneProbe?.rendererMemory.geometries ?? 0) > 0,
    mapId,
  );
  assert.equal(await page.getByTestId('scene-canvas').count(), 1);
}

async function waitForStableFrames(page, expression) {
  await page.waitForFunction(async (probeExpression) => {
    const read = () =>
      probeExpression === 'scene'
        ? window.__sceneProbe?.frameCount
        : window.__phase5ModelProbe?.renderer.info.render.frame;
    const first = read();
    if (typeof first !== 'number') return false;
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const second = read();
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const third = read();
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    return first === second && second === third && read() === third;
  }, expression);
}

function validatePng(file) {
  const path = resolve(outputDirectory, file);
  const bytes = readFileSync(path);
  assert.ok(statSync(path).size >= 5_000, `Screenshot is unexpectedly small: ${file}`);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width >= 300 && height >= 300, `Unexpected screenshot dimensions: ${file}`);
  return {
    file,
    width,
    height,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function capture(page, file) {
  await page.screenshot({
    path: resolve(outputDirectory, file),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
  return validatePng(file);
}

async function openStory(browser, origin, options = {}) {
  const page = await browser.newPage({
    viewport: options.viewport ?? { width: 1365, height: 1000 },
  });
  watchPage(page, origin);
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  await waitForScene(page, 'map-courtyard');
  return page;
}

async function reachLitLantern(page) {
  await page.getByTestId('dialogue-open').click();
  await page.getByTestId('dialogue-choice-seek-truth').click();
  await page.getByTestId('dialogue-close').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="narrative-dialog"]')?.open,
  );
  await page.getByTestId('scene-transition').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop',
  );
  await page.getByTestId('clue-interaction').waitFor({ state: 'visible' });
  await page.getByTestId('clue-interaction').click();
  await page.getByTestId('dialogue-advance').click();
  await page.getByTestId('dialogue-choice-investigate-clue').click();
  await page.getByTestId('dialogue-close').click();
  await page.waitForFunction(
    () =>
      window.__sceneProbe?.lampLit === true &&
      document.querySelector('[data-testid="cinematic-play"]')?.isConnected === true,
  );
  assert.equal(await page.getByTestId('quest-status').getAttribute('data-status'), 'completed');
  assert.equal(await page.getByTestId('clue-status').getAttribute('data-resolved'), 'true');
}

try {
  const dirtyRuntime = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'examples/scene-demo/src',
      'examples/scene-demo/index.html',
      'examples/scene-demo/vite.config.ts',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  assert.equal(dirtyRuntime, '', 'Commit scene-demo runtime files before recording provenance');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  assert.match(sourceCommit, /^[0-9a-f]{40}$/);
  mkdirSync(outputDirectory, { recursive: true });

  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object', 'Vite preview must use an ephemeral port');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const records = [];

  const assetPage = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  watchPage(assetPage, origin);
  await assetPage.goto(`${origin}/?phase5=assets&phase5-test=1`, { waitUntil: 'networkidle' });
  await assetPage.addStyleTag({
    content:
      '[data-testid="toggle-traveler-instance"], [data-testid="gameplay-stale-move"] { display: none !important; }',
  });
  await assetPage.waitForFunction(() =>
    ['static', 'traveler', 'guardian'].every(
      (id) =>
        document.querySelector(`[data-testid="model-status-${id}"]`)?.dataset.status === 'ready',
    ),
  );
  assert.equal(
    await assetPage.getByTestId('model-status-static').getAttribute('data-asset-id'),
    'phase5-textured-static',
  );
  assert.equal(
    await assetPage.getByTestId('model-status-traveler').getAttribute('data-asset-id'),
    'phase5-animated-guardian',
  );
  await assetPage.waitForFunction(
    () => (window.__phase5ModelProbe?.renderer.info.render.frame ?? 0) > 0,
  );
  await assetPage.waitForFunction(
    () =>
      window.__phase5ModelProbe?.animationSnapshot?.('traveler')?.active === false &&
      window.__phase5ModelProbe?.animationSnapshot?.('guardian')?.active === false,
  );
  const frameBeforeStaticCapture = await assetPage.evaluate(
    () => window.__phase5ModelProbe?.renderer.info.render.frame ?? 0,
  );
  await assetPage.getByTestId('toggle-character-instances').click();
  await assetPage.waitForFunction(
    (initialFrame) =>
      window.__phase5ModelProbe?.scene.getObjectByName('phase5:traveler') === undefined &&
      window.__phase5ModelProbe?.scene.getObjectByName('phase5:guardian') === undefined &&
      (window.__phase5ModelProbe?.renderer.info.render.frame ?? 0) > initialFrame,
    frameBeforeStaticCapture,
  );
  const hideCharacterTestControl = await assetPage.addStyleTag({
    content: '[data-testid="toggle-character-instances"] { display: none !important; }',
  });
  records.push(await capture(assetPage, screenshotNames[0]));

  await hideCharacterTestControl.evaluate((element) => element.remove());
  const frameBeforeRiggedCapture = await assetPage.evaluate(
    () => window.__phase5ModelProbe?.renderer.info.render.frame ?? 0,
  );
  await assetPage.getByTestId('toggle-character-instances').click();
  await assetPage.waitForFunction((initialFrame) => {
    const scene = window.__phase5ModelProbe?.scene;
    const traveler = scene?.getObjectByName('phase5:traveler');
    const guardian = scene?.getObjectByName('phase5:guardian');
    return Boolean(
      traveler &&
      guardian &&
      (window.__phase5ModelProbe?.renderer.info.render.frame ?? 0) > initialFrame,
    );
  }, frameBeforeRiggedCapture);
  await assetPage.addStyleTag({
    content: '[data-testid="toggle-character-instances"] { display: none !important; }',
  });
  const independentSkeletons = await assetPage.evaluate(() => {
    const skeletonFor = (instanceId) => {
      const root = window.__phase5ModelProbe?.scene.getObjectByName(`phase5:${instanceId}`);
      let skeleton = null;
      root?.traverse((object) => {
        if (object.isSkinnedMesh) skeleton ??= object.skeleton;
      });
      return skeleton;
    };
    const traveler = skeletonFor('traveler');
    const guardian = skeletonFor('guardian');
    return Boolean(traveler && guardian && traveler !== guardian);
  });
  assert.equal(independentSkeletons, true, 'each live rig instance owns an independent skeleton');
  assert.equal(
    await assetPage.getByTestId('model-status-traveler').getAttribute('data-skinned-meshes'),
    '1',
  );
  assert.equal(
    await assetPage.getByTestId('model-status-guardian').getAttribute('data-skinned-meshes'),
    '1',
  );
  records.push(await capture(assetPage, screenshotNames[1]));

  const modelMemory = await assetPage.evaluate(() => ({
    geometries: window.__phase5ModelProbe?.renderer.info.memory.geometries ?? 0,
    textures: window.__phase5ModelProbe?.renderer.info.memory.textures ?? 0,
  }));
  const modelLoads = await assetPage.evaluate(() =>
    ['static', 'traveler', 'guardian'].map((id) => ({
      instance: id,
      assetId: document
        .querySelector(`[data-testid="model-status-${id}"]`)
        ?.getAttribute('data-asset-id'),
      loadDurationMs: Number(
        document.querySelector(`[data-testid="model-status-${id}"]`)?.getAttribute('data-load-ms'),
      ),
    })),
  );
  assert.ok(modelMemory.geometries > 0 && modelMemory.textures > 0);
  assert.ok(
    modelLoads.every((load) => Number.isFinite(load.loadDurationMs) && load.loadDurationMs >= 0),
  );

  const frameBeforeMove = await assetPage.evaluate(
    () => window.__phase5ModelProbe?.renderer.info.render.frame ?? 0,
  );
  await assetPage.evaluate(() => {
    const initialFrame = window.__phase5ModelProbe?.renderer.info.render.frame ?? 0;
    let previousFrame = initialFrame;
    let renderedFrames = 0;
    let observedMove = false;
    window.__phase5MoveFrameMeasurement = new Promise((resolveFrames) => {
      const sample = () => {
        const currentFrame = window.__phase5ModelProbe?.renderer.info.render.frame ?? previousFrame;
        renderedFrames += Math.max(0, currentFrame - previousFrame);
        previousFrame = currentFrame;
        const action = window.__phase5ModelProbe?.animationSnapshot?.('traveler');
        if (action?.semanticAction === 'move') observedMove = true;
        if (observedMove && action?.semanticAction !== 'move') {
          resolveFrames(renderedFrames);
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  await assetPage.getByTestId('gameplay-move').click();
  await assetPage.waitForFunction(() =>
    document
      .querySelector('[data-testid="animation-action-traveler"]')
      ?.textContent?.includes('move'),
  );
  await assetPage.waitForFunction(
    () => window.__phase5ModelProbe?.animationSnapshot?.('traveler')?.semanticAction === 'move',
  );
  await assetPage.waitForFunction(
    (initialFrame) =>
      (window.__phase5ModelProbe?.renderer.info.render.frame ?? initialFrame) > initialFrame,
    frameBeforeMove,
  );
  const frameAfterMove = await assetPage.evaluate(
    () => window.__phase5ModelProbe?.renderer.info.render.frame ?? 0,
  );
  const moveAnimationRenderedFrames = await assetPage.evaluate(
    async () => await window.__phase5MoveFrameMeasurement,
  );
  assert.ok(moveAnimationRenderedFrames > 0);
  records.push(await capture(assetPage, screenshotNames[2]));
  await assetPage.waitForFunction(
    () =>
      window.__phase5ModelProbe?.animationSnapshot?.('traveler')?.active === false &&
      window.__phase5ModelProbe?.animationSnapshot?.('traveler')?.semanticAction === 'idle',
  );
  await waitForStableFrames(assetPage, 'model');
  const idleModelFrameStart = await assetPage.evaluate(
    () => window.__phase5ModelProbe?.renderer.info.render.frame ?? 0,
  );
  await waitForStableFrames(assetPage, 'model');
  const idleModelFrameEnd = await assetPage.evaluate(
    () => window.__phase5ModelProbe?.renderer.info.render.frame ?? 0,
  );
  assert.equal(idleModelFrameEnd, idleModelFrameStart, 'model demand rendering settles while idle');
  await assetPage.close();

  const storyPage = await openStory(browser, origin);
  await reachLitLantern(storyPage);
  records.push(await capture(storyPage, screenshotNames[6]));
  const initialCamera = await storyPage.evaluate(() => window.__sceneProbe?.cameraPosition);
  await storyPage.getByTestId('cinematic-play').focus();
  await storyPage.keyboard.press('Enter');
  await storyPage.waitForFunction(
    (initial) =>
      document.querySelector('[data-testid="cinematic-status"]')?.dataset.status === 'playing' &&
      window.__sceneProbe?.cameraPosition.some(
        (value, index) => Math.abs(value - initial[index]) > 0.05,
      ),
    initialCamera,
  );
  records.push(await capture(storyPage, screenshotNames[4]));
  await storyPage.waitForFunction(() => window.__sceneProbe?.guardianAction === 'interact');
  records.push(await capture(storyPage, screenshotNames[3]));
  await storyPage.getByTestId('cinematic-caption').waitFor({ state: 'visible' });
  assert.equal(await storyPage.getByTestId('cinematic-caption').getAttribute('dir'), 'rtl');
  assert.equal(await storyPage.getByTestId('cinematic-caption').getAttribute('lang'), 'fa');
  records.push(await capture(storyPage, screenshotNames[5]));
  await storyPage.waitForFunction(
    () => document.querySelector('[data-testid="cinematic-status"]')?.dataset.status === 'waiting',
  );
  await storyPage.getByTestId('cinematic-continue').click();
  await storyPage.waitForFunction(
    () =>
      document.querySelector('[data-testid="cinematic-status"]')?.dataset.status === 'completed',
  );

  await storyPage.waitForFunction(() => (window.__sceneProbe?.rendererMemory.geometries ?? 0) > 0);
  const rendererMemoryBeforeCycles = await storyPage.evaluate(
    () => window.__sceneProbe?.rendererMemory,
  );
  const disposedScenesBeforeCycles = await storyPage.evaluate(
    () => window.__sceneProbe?.disposedScenes ?? 0,
  );
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await storyPage.getByTestId('scene-transition').click();
    await storyPage.waitForFunction(
      () => document.querySelector('[data-testid="active-map"]')?.textContent === 'map-courtyard',
    );
    await storyPage.getByTestId('scene-transition').click();
    await storyPage.waitForFunction(
      () => document.querySelector('[data-testid="active-map"]')?.textContent === 'map-workshop',
    );
  }
  await storyPage.waitForFunction(
    (initialCount) => (window.__sceneProbe?.disposedScenes ?? 0) >= initialCount + 10,
    disposedScenesBeforeCycles,
  );
  const disposedScenesAfterCycles = await storyPage.evaluate(
    () => window.__sceneProbe?.disposedScenes ?? 0,
  );
  await waitForStableFrames(storyPage, 'scene');
  const rendererMemoryAfterCycles = await storyPage.evaluate(
    () => window.__sceneProbe?.rendererMemory,
  );
  const idleSceneFrameStart = await storyPage.evaluate(() => window.__sceneProbe?.frameCount ?? 0);
  await waitForStableFrames(storyPage, 'scene');
  const idleSceneFrameEnd = await storyPage.evaluate(() => window.__sceneProbe?.frameCount ?? 0);
  assert.ok(rendererMemoryBeforeCycles && rendererMemoryAfterCycles);
  assert.ok(rendererMemoryAfterCycles.geometries <= rendererMemoryBeforeCycles.geometries + 1);
  assert.ok(rendererMemoryAfterCycles.textures <= rendererMemoryBeforeCycles.textures + 1);
  assert.equal(idleSceneFrameEnd, idleSceneFrameStart);
  await storyPage.close();

  const reducedPage = await openStory(browser, origin, { reducedMotion: true });
  await reachLitLantern(reducedPage);
  assert.equal(await reducedPage.getByTestId('cinematic-reduced-motion').count(), 1);
  const reducedCamera = await reducedPage.evaluate(() => window.__sceneProbe?.cameraPosition);
  await reducedPage.getByTestId('cinematic-play').click();
  await reducedPage.getByTestId('cinematic-caption').waitFor({ state: 'visible' });
  await reducedPage.waitForFunction(
    () => document.querySelector('[data-testid="cinematic-status"]')?.dataset.status === 'waiting',
  );
  assert.deepEqual(
    await reducedPage.evaluate(() => window.__sceneProbe?.cameraPosition),
    reducedCamera,
  );
  assert.equal(await reducedPage.evaluate(() => window.__sceneProbe?.guardianAction), 'idle');
  assert.equal(await reducedPage.evaluate(() => window.__sceneProbe?.lanternAccent), false);
  records.push(await capture(reducedPage, screenshotNames[7]));
  await reducedPage.close();

  const mobilePage = await openStory(browser, origin, {
    viewport: { width: 390, height: 844 },
  });
  const mobileLayout = await mobilePage.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    canvas:
      document.querySelector('[data-testid="scene-canvas"]')?.getBoundingClientRect().width ?? 0,
  }));
  assert.ok(
    mobileLayout.width <= mobileLayout.viewport,
    `mobile layout overflows: ${JSON.stringify(mobileLayout)}`,
  );
  assert.ok(mobileLayout.canvas > 0 && mobileLayout.canvas <= mobileLayout.viewport);
  records.push(await capture(mobilePage, screenshotNames[8]));
  await mobilePage.close();

  assert.deepEqual(externalRequests, [], 'Phase 5 demo must not contact external runtime services');
  assert.deepEqual(errors, [], 'production screenshots must have no unhandled browser errors');
  assert.equal(records.length, screenshotNames.length);
  const assetRecords = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, 'examples/scene-demo/src/animation/asset-records.json'),
      'utf8',
    ),
  );
  const modelMeasurements = assetRecords
    .filter((asset) => ['phase5-textured-static', 'phase5-animated-guardian'].includes(asset.id))
    .map((asset) => ({
      id: asset.id,
      outputBytes: asset.metrics.outputBytes,
      triangles: asset.metrics.triangles,
      primitiveCount: asset.metrics.primitiveCount,
      textureCount: asset.metrics.textureCount,
      textureBytes: asset.metrics.textureBytes,
      maxTextureDimension: asset.metrics.maxTextureDimension,
      estimatedDecodedBytes: asset.metrics.estimatedDecodedBytes,
      joints: asset.metrics.jointCount,
      clips: asset.clipInventory,
      outputSha256: asset.outputSha256,
    }));
  assert.equal(modelMeasurements.length, 2);
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        sourceCommit,
        browser: `Chromium ${browser.version()} via Playwright, headless SwiftShader`,
        testedDevices: [
          'Headless Linux Chromium with SwiftShader only; physical mobile GPU not tested',
        ],
        viewport: {
          desktop: { width: 1365, height: 1000 },
          mobilePortrait: { width: 390, height: 844 },
        },
        images: records,
        models: modelMeasurements,
        observedRuntime: {
          modelRendererMemory: modelMemory,
          modelLoadMs: modelLoads,
          firstAcceptedMoveFrameDelta: frameAfterMove - frameBeforeMove,
          moveAnimationRenderedFrames,
          modelIdleFrameDelta: idleModelFrameEnd - idleModelFrameStart,
          sceneRendererMemoryBeforeFiveWarmCycles: rendererMemoryBeforeCycles,
          sceneRendererMemoryAfterFiveWarmCycles: rendererMemoryAfterCycles,
          warmedMapRoundTrips: 5,
          disposedScenesDuringWarmCycles: disposedScenesAfterCycles - disposedScenesBeforeCycles,
          toleratedMemoryGrowth: { geometries: 1, textures: 1 },
          sceneIdleFrameDelta: idleSceneFrameEnd - idleSceneFrameStart,
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Captured ${records.length} real production Chromium Phase 5 scenes; provenance recorded at ${manifestPath}.`,
  );
} finally {
  await browser?.close();
  await server?.close();
}
