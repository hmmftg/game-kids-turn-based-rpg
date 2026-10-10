import { expect, test } from '@playwright/test';
import { expandTrail, startGame } from './harness.ts';

/**
 * Small screens carry the quest journey collapsed behind a chip so the rail
 * does not fill the screen; the full rail opens on tap and closes on quest
 * pick or an outside tap. Both e2e projects are compact layouts.
 */
test.describe('quest trail collapse', () => {
  test('starts collapsed, expands on chip tap, collapses on quest pick', async ({ page }) => {
    await startGame(page);

    const toggle = page.getByTestId('trail-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('quest-trail')).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const chip = page.getByTestId('trail-quest-greeting');
    await expect(chip).toBeVisible();

    await chip.click();
    await expect(page.getByTestId('quest-trail')).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('outside tap collapses the open rail', async ({ page }) => {
    await startGame(page);
    await expandTrail(page);
    await expect(page.getByTestId('quest-trail')).toBeVisible();

    // A world tap outside the rail dismisses it — dismissal is free.
    await page.mouse.click(page.viewportSize()!.width / 2, page.viewportSize()!.height * 0.7);
    await expect(page.getByTestId('quest-trail')).toBeHidden();
  });
});
