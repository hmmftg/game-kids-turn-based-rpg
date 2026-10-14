import { expect, test } from '@playwright/test';
import { resumeFromPicker, startGame } from './harness.ts';

/**
 * Pause-menu audio controls. Asserts UI state + persistence only — headless
 * runs never produce audible output, and these specs don't try to.
 */
test('volume sliders update, disable on mute, and persist across reload', async ({ page }) => {
  await startGame(page);

  await page.getByTestId('pause-button').click();
  const music = page.getByTestId('music-volume');
  const sfx = page.getByTestId('sfx-volume');
  await expect(music).toBeVisible();
  await expect(sfx).toBeVisible();

  await music.fill('0.3');
  await sfx.fill('0.4');
  await expect(music).toHaveValue('0.3');
  await expect(sfx).toHaveValue('0.4');

  // A muted bus keeps its stored level but the slider can't be dragged.
  await page.getByTestId('toggle-music').click();
  await expect(music).toBeDisabled();
  await page.getByTestId('toggle-music').click();
  await expect(music).toBeEnabled();

  await page.getByTestId('resume-button').click();

  await page.reload();
  await resumeFromPicker(page);
  await page.getByTestId('pause-button').click();
  await expect(page.getByTestId('music-volume')).toHaveValue('0.3');
  await expect(page.getByTestId('sfx-volume')).toHaveValue('0.4');
});
