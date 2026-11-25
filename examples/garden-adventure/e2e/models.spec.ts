import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

test('loads the pinned animated and static models through Three.js leases in Garden maps', async ({
  page,
}) => {
  await page.goto('/?modelprobe=1');
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenBundledModels?.['garden-hero']?.status === 'ready'),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenBundledModels?.['garden-hero']?.action === 'idle'),
    )
    .toBe(true);

  await interact(page, 'garden-gate');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__gardenBundledModels?.['garden-lantern-base']?.status === 'ready',
      ),
    )
    .toBe(true);
  const requestedModels = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname)
      .filter((pathname) => pathname.startsWith('/models/')),
  );
  expect(requestedModels).toEqual(
    expect.arrayContaining([
      '/models/phase5-animated-guardian.glb',
      '/models/phase5-textured-static.glb',
    ]),
  );
});

test('missing bundled GLBs keep procedural characters and landmarks visible', async ({ page }) => {
  await page.route('**/models/*.glb', (route) => route.abort());
  await page.goto('/?modelprobe=1');
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenBundledModels?.['garden-hero']?.status === 'error'),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.visibleMeshCount ?? 0))
    .toBeGreaterThan(10);

  await interact(page, 'garden-gate');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__gardenBundledModels?.['garden-lantern-base']?.status === 'error',
      ),
    )
    .toBe(true);
  await expect(page.getByTestId('target-ancient-lantern')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__gardenProbe?.visibleMeshCount ?? 0))
    .toBeGreaterThan(10);
});
