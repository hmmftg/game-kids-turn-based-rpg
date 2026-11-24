import { expect, test } from '@playwright/test';

test('equipment unlocks the tactical encounter, which restores mid-combat and awards one victory bundle', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByTestId('game-scene').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('inventory')).toContainText('ember-charm × 1');
  await expect(page.getByTestId('equipment')).toContainText('ember-charm');
  await page.getByTestId('start-encounter').click();
  await expect(page.getByTestId('combat-status')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('combat-status')).toBeVisible();
  await page.getByTestId('action-strike').click();
  await expect(page.getByTestId('outcome')).toHaveText('victory');
  await expect(page.getByTestId('applied-rewards')).toHaveText('Applied rewards: 2');
  await page.screenshot({ path: testInfo.outputPath('tactical-victory.png'), fullPage: true });
  await page.reload();
  await expect(page.getByTestId('outcome')).toHaveText('victory');
  await expect(page.getByTestId('applied-rewards')).toHaveText('Applied rewards: 2');
});

test('a deterministic enemy turn can defeat the player and withdrawal is a separate result', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('start-encounter').click();
  await page.getByTestId('action-wait').click();
  await expect(page.getByTestId('outcome')).toHaveText('defeat');
  await page.getByTestId('restart-game').click();
  await page.getByTestId('start-encounter').click();
  await page.getByTestId('action-withdraw').click();
  await expect(page.getByTestId('outcome')).toHaveText('withdrawn');
});

test('invalid save recovery keeps the original bytes and does not autosave session-only play', async ({
  page,
}) => {
  const original = '{bad tactical save';
  await page.addInitScript(
    (bytes) => localStorage.setItem('generated-tactical-game-save-v1', bytes),
    original,
  );
  await page.goto('/');
  await expect(page.getByTestId('save-warning')).toBeVisible();
  await page.getByTestId('recovery-continue').click();
  await page.getByTestId('start-encounter').click();
  await page.getByTestId('action-wait').click();
  expect(await page.evaluate(() => localStorage.getItem('generated-tactical-game-save-v1'))).toBe(
    original,
  );
});
