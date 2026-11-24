import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import recordsJson from '../../../examples/scene-demo/src/animation/asset-records.json' with { type: 'json' };

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const records = recordsJson as typeof recordsJson;
const rigged = records.find((record) => record.metrics.jointCount > 0)!;
const staticRecord = records.find((record) => record.metrics.jointCount === 0)!;

test('imports an unapproved local record for preview, inspects it, orbits, and renders independent rigs', async ({
  page,
}) => {
  const technicalOnly = { ...rigged, rights: { ...rigged.rights, approved: false } };
  await page.route('http://127.0.0.1:4175/creator-preview-records.json', (route) =>
    route.fulfill({ json: [staticRecord, technicalOnly] }),
  );
  await page.goto('/?records=/creator-preview-records.json');
  await page.getByTestId('preview-asset-select').selectOption(rigged.id);
  await expect(page.getByTestId('preview-primary-status')).toContainText('Ready');
  await expect(page.getByTestId('preview-secondary-status')).toContainText('Ready');
  await expect(page.getByTestId('preview-approval')).toHaveText('Not approved');
  await expect(page.getByTestId('preview-disclaimer')).toContainText('does not approve');
  await expect(page.getByTestId('preview-primary-clip')).toHaveText('idle');
  await expect(page.getByTestId('preview-secondary-clip')).toHaveText('move');
  await expect(page.getByTestId('preview-renderer-memory')).toHaveText(/^[1-9]\d* geometries/);
  const independentRigs = await page.evaluate(() => {
    const scene = window.__creatorPreviewProbe?.scene;
    const primary = scene?.getObjectByName('creator-preview:phase5-animated-guardian:primary');
    const secondary = scene?.getObjectByName('creator-preview:phase5-animated-guardian:secondary');
    let primarySkeleton: object | undefined;
    let secondarySkeleton: object | undefined;
    primary?.traverse((object) => {
      const mesh = object as typeof object & { isSkinnedMesh?: boolean; skeleton?: object };
      if (mesh.isSkinnedMesh && mesh.skeleton) primarySkeleton = mesh.skeleton;
    });
    secondary?.traverse((object) => {
      const mesh = object as typeof object & { isSkinnedMesh?: boolean; skeleton?: object };
      if (mesh.isSkinnedMesh && mesh.skeleton) secondarySkeleton = mesh.skeleton;
    });
    return {
      bothInstances: Boolean(primary && secondary),
      separateSkeletons: Boolean(
        primarySkeleton && secondarySkeleton && primarySkeleton !== secondarySkeleton,
      ),
    };
  });
  expect(independentRigs).toEqual({ bothInstances: true, separateSkeletons: true });

  const canvas = page.getByTestId('creator-preview-canvas');
  await expect(canvas).toBeVisible();
  const before = await page.evaluate(() => window.__creatorPreviewProbe?.camera.position.toArray());
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 110, bounds.y + bounds.height / 2 - 30);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__creatorPreviewProbe?.camera.position.toArray());
  assert.notDeepEqual(after, before, 'orbit input changes the camera');
  await page.mouse.wheel(0, -420);
  await expect
    .poll(() => page.evaluate(() => window.__creatorPreviewProbe?.camera.position.length()))
    .not.toBe(0);

  await page.getByTestId('preview-semantic-select').selectOption('move');
  await expect(page.getByTestId('preview-primary-clip')).toHaveText('move');
  await page.getByTestId('preview-secondary-clip-select').selectOption('interact');
  await expect(page.getByTestId('preview-secondary-clip')).toHaveText('interact');
  await page.getByTestId('preview-reduced-motion').check();
  await expect(page.getByTestId('preview-reduced-motion')).toBeChecked();
  await page.getByTestId('preview-reduced-motion').uncheck();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.getByTestId('preview-reload').click();
    await expect(page.getByTestId('preview-primary-status')).toContainText('Ready');
    await expect(page.getByTestId('preview-secondary-status')).toContainText('Ready');
  }
  const lostContext = await page.evaluate(() => {
    const renderer = window.__creatorPreviewProbe?.renderer;
    const extension = renderer?.getContext().getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(lostContext).toBe(true);
  await expect(page.getByTestId('preview-context-recover')).toBeVisible();
  await page.getByTestId('preview-context-recover').click();
  await expect(page.getByTestId('preview-primary-status')).toContainText('Ready');
  await expect(page.getByTestId('preview-secondary-status')).toContainText('Ready');

  const screenshot = resolve(repositoryRoot, 'docs/previews/creator/rigged-asset-preview.png');
  await mkdir(dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
});

test('loads the configured game-local asset-record manifest route', async ({ page }) => {
  await page.goto('/?records=/__creator/asset-records.json');
  await expect(page.getByTestId('preview-asset-select')).toHaveValue('phase5-khronos-box');
  await expect(page.getByTestId('preview-primary-status')).toContainText('Ready');
});

test('rejects remote manifest URLs and shows local model loading failures without stale objects', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4175/?records=https%3A%2F%2Fexample.invalid%2Frecords.json');
  await expect(page.getByRole('alert')).toContainText('local origin');

  const badRecord = {
    ...staticRecord,
    id: 'preview-integrity-error',
    runtimePath: 'models/preview-integrity-error.glb',
    outputSha256: '0'.repeat(64),
  };
  await page.route('http://127.0.0.1:4175/preview-error-records.json', (route) =>
    route.fulfill({ json: [badRecord] }),
  );
  await page.route('**/models/preview-integrity-error.glb', (route) =>
    route.fulfill({
      path: resolve(repositoryRoot, 'examples/scene-demo/public', staticRecord.runtimePath),
    }),
  );
  await page.goto('/?records=/preview-error-records.json');
  await expect(page.getByTestId('preview-primary-status')).toHaveAttribute('data-status', 'error');
  await expect(page.getByTestId('preview-load-error')).toContainText('SHA-256');
  await expect(page.getByTestId('preview-primary-count')).toHaveText('0');
});

test('aborting a slow asset load and switching projects never renders the released request', async ({
  page,
}) => {
  const slowRecord = {
    ...staticRecord,
    id: 'preview-slow-static',
    runtimePath: 'models/preview-slow-static.glb',
  };
  await page.route('http://127.0.0.1:4175/slow-preview-records.json', (route) =>
    route.fulfill({ json: [staticRecord, slowRecord] }),
  );
  await page.route('**/models/preview-slow-static.glb', async (route) => {
    await page.waitForTimeout(800);
    try {
      await route.fulfill({
        path: resolve(repositoryRoot, 'examples/scene-demo/public', staticRecord.runtimePath),
      });
    } catch {
      // Switching the selected asset aborts this route by design.
    }
  });
  await page.goto('/?records=/slow-preview-records.json');
  await page.getByTestId('preview-asset-select').selectOption('preview-slow-static');
  await page.getByTestId('preview-asset-select').selectOption(staticRecord.id);
  await expect(page.getByTestId('preview-primary-status')).toContainText('Ready');
  await page.waitForTimeout(900);
  await expect(page.getByTestId('preview-primary-count')).toHaveText('1');
  const ids = await page.evaluate(() => {
    const found: string[] = [];
    window.__creatorPreviewProbe?.scene.traverse((object) => {
      if (object.name.startsWith('creator-preview:')) found.push(object.name);
    });
    return found;
  });
  assert.deepEqual(ids.sort(), [
    `creator-preview:${staticRecord.id}:primary`,
    `creator-preview:${staticRecord.id}:secondary`,
  ]);
});
