import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const expectedAssetIds = [
  'meshy-garden-fountain',
  'meshy-garden-guardian',
  'meshy-garden-blossom-tree',
  'meshy-garden-shrine',
  'meshy-garden-sage',
].sort();
const outputDirectory = resolve(
  process.env['WAYPOINT_MESHY_SCREENSHOT_DIR'] ??
    join(os.tmpdir(), 'waypoint-rpg-meshy-pilot', 'screenshots', 'creator-preview'),
);
const relativeOutput = relative(repositoryRoot, outputDirectory);
assert.ok(
  relativeOutput === '..' || relativeOutput.startsWith(`..${sep}`) || isAbsolute(relativeOutput),
  'Meshy browser screenshots must be written outside the repository.',
);

interface PilotRecord {
  readonly id: string;
  readonly sourceSha256: string;
  readonly outputSha256: string;
  readonly rights: { readonly approved: boolean };
}

interface CaptureRecord {
  readonly assetId: string;
  readonly sourceSha256: string;
  readonly runtimeSha256: string;
  readonly rightsApproved: boolean;
  readonly screenshot: string;
  readonly screenshotSha256: string;
  readonly timeToReadyMs: number;
  readonly renderer: {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly geometries: number;
    readonly textures: number;
  };
}

test('renders and captures every private Meshy GLB in the Creator preview', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180_000);
  const manifestResponse = await request.get('/__meshy/pilot/asset-records.json');
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()['x-waypoint-meshy-pilot']).toBe('enabled');
  const manifest = (await manifestResponse.json()) as PilotRecord[];
  expect(manifest.map((record) => record.id).sort()).toEqual(expectedAssetIds);

  await mkdir(outputDirectory, { recursive: true });
  await page.goto('/?records=/__meshy/pilot/asset-records.json');
  const select = page.getByTestId('preview-asset-select');
  await expect(select.locator('option')).toHaveCount(expectedAssetIds.length);
  const captures: CaptureRecord[] = [];

  for (const assetId of expectedAssetIds) {
    const asset = manifest.find((record) => record.id === assetId);
    assert.ok(asset, `The private pilot manifest must include ${assetId}.`);
    const readyStartedAt = await page.evaluate(() => performance.now());
    await select.selectOption(assetId);
    await expect(page.getByTestId('preview-primary-status')).toHaveAttribute(
      'data-status',
      'ready',
      { timeout: 60_000 },
    );
    const timeToReadyMs = await page.evaluate(
      (startedAt) => Number((performance.now() - startedAt).toFixed(2)),
      readyStartedAt,
    );
    await expect(page.getByTestId('preview-primary-count')).not.toHaveText('0');
    await page.waitForFunction((id) => {
      const probe = (
        window as Window & {
          __creatorPreviewProbe?: {
            readonly scene: { getObjectByName(name: string): unknown };
            readonly renderer: {
              readonly info: { readonly render: { readonly calls: number } };
            };
          };
        }
      ).__creatorPreviewProbe;
      return Boolean(
        probe?.scene.getObjectByName(`creator-preview:${id}:primary`) &&
        probe.renderer.info.render.calls > 0,
      );
    }, assetId);

    const screenshot = join(outputDirectory, `${assetId}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const screenshotBytes = await readFile(screenshot);
    assert.equal(screenshotBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const renderer = await page.evaluate(() => {
      const probe = (
        window as Window & {
          __creatorPreviewProbe?: {
            readonly renderer: {
              readonly info: {
                readonly render: { readonly calls: number; readonly triangles: number };
                readonly memory: { readonly geometries: number; readonly textures: number };
              };
            };
          };
        }
      ).__creatorPreviewProbe;
      const info = probe?.renderer.info;
      return {
        drawCalls: info?.render.calls ?? 0,
        triangles: info?.render.triangles ?? 0,
        geometries: info?.memory.geometries ?? 0,
        textures: info?.memory.textures ?? 0,
      };
    });
    assert.ok(renderer.drawCalls > 0, `${assetId} must be submitted to WebGL.`);
    captures.push({
      assetId,
      sourceSha256: asset.sourceSha256,
      runtimeSha256: asset.outputSha256,
      rightsApproved: asset.rights.approved,
      screenshot: screenshot.split(sep).join('/'),
      screenshotSha256: createHash('sha256').update(screenshotBytes).digest('hex'),
      timeToReadyMs,
      renderer,
    });
  }

  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const metadata = {
    sourceCommit,
    sourceTreeHasTrackedChanges: trackedChanges.length > 0,
    capturedAt: new Date().toISOString(),
    browser: { name: 'Chromium', version: browser.version() },
    rendering: {
      mode: 'headless Chromium with ANGLE SwiftShader',
      viewport: { width: 1440, height: 1000 },
      userAgent: await page.evaluate(() => navigator.userAgent),
    },
    assets: captures,
  };
  await writeFile(
    join(outputDirectory, 'provenance.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
});
