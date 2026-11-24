import { expect, test } from '@playwright/test';

test('Persian branching story saves, reloads and reaches two separate endings', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('game-scene').locator('canvas')).toBeVisible();
  await page.getByTestId('begin-story').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dialogue-choice')).toBeVisible();
  await page.getByTestId('choice-truth').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('truth-node')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('truth-node')).toBeVisible();
  await page.getByTestId('finish-story').click();
  await expect(page.getByTestId('story-ending')).toHaveText('ending-truth');
  await page.screenshot({
    path: testInfo.outputPath('narrative-truth-ending.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByTestId('story-ending')).toHaveText('ending-truth');
  await page.getByTestId('restart-story').click();
  await page.getByTestId('begin-story').click();
  await page.getByTestId('choice-peace').click();
  await page.getByTestId('finish-story').click();
  await expect(page.getByTestId('story-ending')).toHaveText('ending-peace');
});

test('invalid save recovery preserves original bytes and keeps the session-only run playable', async ({
  page,
}) => {
  const original = '{broken save';
  await page.addInitScript(
    (bytes) => localStorage.setItem('generated-narrative-game-save-v1', bytes),
    original,
  );
  await page.goto('/');
  await expect(page.getByTestId('save-warning')).toBeVisible();
  await page.getByTestId('recovery-continue').click();
  await page.getByTestId('begin-story').click();
  await page.getByTestId('choice-peace').click();
  await page.getByTestId('finish-story').click();
  await expect(page.getByTestId('story-ending')).toHaveText('ending-peace');
  expect(await page.evaluate(() => localStorage.getItem('generated-narrative-game-save-v1'))).toBe(
    original,
  );
});
