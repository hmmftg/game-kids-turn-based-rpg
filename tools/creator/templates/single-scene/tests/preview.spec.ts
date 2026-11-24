import { expect, test } from '@playwright/test';

test('generated single-scene project renders and can be captured', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await expect(page.getByTestId('game-scene').locator('canvas')).toBeVisible();
  await page.getByTestId('scene-interact').click();
  await expect(page.getByTestId('interaction-count')).toHaveText('Interactions: 1');
  await page.screenshot({ path: testInfo.outputPath('single-scene.png'), fullPage: true });
});
