import { expect, test, type Page } from '@playwright/test';
import { startGame } from './harness.ts';

/** PR T — child-facing zoom: a projection-only multiplier on the ortho
 *  camera. These tests assert the camera's zoom changes while everything
 *  else (world state, interaction, demand loop) stays put. */

const cameraZoom = async (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as { __worldCamera?: { zoom: number } }).__worldCamera?.zoom ?? 0,
  );

/** The probe publishes the camera after the canvas' first frame. */
async function baseZoom(page: Page): Promise<number> {
  await expect.poll(() => cameraZoom(page), { timeout: 8000 }).toBeGreaterThan(0);
  return cameraZoom(page);
}

/** Wait until the eased camera zoom settles near `expected`. */
async function waitForZoom(page: Page, expected: number) {
  await expect.poll(() => cameraZoom(page), { timeout: 8000 }).toBeGreaterThan(expected - 0.5);
  await expect.poll(() => cameraZoom(page), { timeout: 8000 }).toBeLessThan(expected + 0.5);
}

/** Click until the button disables itself at the band edge (bounded). */
async function clickUntilDisabled(locator: ReturnType<Page['getByTestId']>, max = 10) {
  for (let i = 0; i < max; i += 1) {
    if (await locator.isDisabled()) return;
    await locator.click();
  }
}

test.describe('camera zoom (PR T)', () => {
  test('zoom-out then zoom-in changes only the camera projection', async ({ page }) => {
    await startGame(page);
    const base = await baseZoom(page);

    // Zoom out two steps → factor 0.8.
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();
    await waitForZoom(page, base * 0.8);

    // Zoom back to default → factor 1.0 again.
    await page.getByTestId('zoom-in').click();
    await page.getByTestId('zoom-in').click();
    await waitForZoom(page, base);
  });

  test('buttons clamp at the 0.75–1.35 band and read as disabled at limits', async ({ page }) => {
    await startGame(page);
    const base = await baseZoom(page);
    const zoomOut = page.getByTestId('zoom-out');
    const zoomIn = page.getByTestId('zoom-in');

    await clickUntilDisabled(zoomOut);
    await expect(zoomOut).toBeDisabled();
    await waitForZoom(page, base * 0.75);

    await clickUntilDisabled(zoomIn);
    await expect(zoomIn).toBeDisabled();
    await waitForZoom(page, base * 1.35);
  });

  test('wheel zooms without moving the walk destination', async ({ page }) => {
    await startGame(page);
    const base = await baseZoom(page);
    const canvas = page.locator('.world canvas');
    await canvas.hover();
    await page.mouse.wheel(0, -400);
    await expect.poll(() => cameraZoom(page), { timeout: 8000 }).toBeGreaterThan(base * 1.05);
    // The avatar is still idle at its anchor — zoom is a camera concern only.
    const moving = await page.evaluate(
      () => (window as unknown as { __worldMoving?: boolean }).__worldMoving,
    );
    expect(moving).toBe(false);
  });
});
