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

test('development Strict Mode loads the bundled static and rigged GLBs', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await start(page, '?modelprobe=1');

  await expect
    .poll(() => page.evaluate(() => window.__gardenBundledModels?.['garden-hero']?.status))
    .toBe('ready');
  await interact(page, 'garden-gate');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__gardenBundledModels?.['garden-guardian']?.status))
    .toBe('ready');
  await expect
    .poll(() => page.evaluate(() => window.__gardenBundledModels?.['garden-lantern-base']?.status))
    .toBe('ready');

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
  expect(pageErrors).toEqual([]);
});

test('development Strict Mode presents the ending dialogue cue visibly and accessibly', async ({
  page,
}) => {
  await start(page, '?cinematicprobe=1');
  await interact(page, 'gardener');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await interact(page, 'seed-basket');
  await interact(page, 'garden-gate');
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toBeVisible();

  const dialogueCue = page.getByTestId('cinematic-dialogue');
  await expect(dialogueCue).toBeVisible();
  await expect(dialogueCue).toHaveAttribute('role', 'status');
  await expect(dialogueCue).toHaveAttribute('aria-live', 'polite');
  await expect(dialogueCue).toHaveAttribute('data-cinematic-dialogue', 'tree-ending');
  await expect(dialogueCue).toContainText('باغ با مراقبت و دوستی جان گرفت');
  await expect
    .poll(() => page.evaluate(() => window.__gardenEndingCinematicProbe?.status))
    .toBe('completed');
});
