import { test, expect } from '@playwright/test';
import { resumeFromPicker, startGame } from './harness.ts';

test.describe('live diagnostics (?diagnostics=1)', () => {
  test('the parent area opens the diagnostics-enabled world', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('pause-button').click();
    await page.getByTestId('parent-entry-pause').click();
    const hold = await page.getByTestId('parent-gate-hold').boundingBox();
    if (!hold) throw new Error('parent-gate-hold has no bounding box');
    await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
    await page.mouse.down();
    await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
    await page.mouse.up();

    await page.getByTestId('open-diagnostics').click();
    // The flag navigates like ?worldbuilder=1 — a reload lands on the picker.
    await resumeFromPicker(page);
    expect(page.url()).toContain('diagnostics=1');
  });

  test('the readout reports a live world and closes back to the hub', async ({ page }) => {
    await startGame(page, '/?diagnostics=1');
    await page.getByTestId('diag-button').click();
    const panel = page.getByTestId('diagnostics-panel');
    await expect(panel).toBeVisible();

    // Live numbers, not placeholders — the world is mounted behind the panel.
    await expect(page.getByTestId('diag-calls')).not.toContainText('—');
    await expect(page.getByTestId('diag-nodes')).not.toContainText('—');
    const calls = Number((await page.getByTestId('diag-calls').textContent())?.match(/\d+/)?.[0]);
    expect(calls).toBeGreaterThan(0);
    await expect(page.getByTestId('diag-map')).toContainText('map-town');
    await expect(page.getByTestId('diag-save')).toContainText(/fresh|loaded|migrated|recovered/);

    // A demand-rendered still scene draws no frames; a walk does.
    await page.getByTestId('diagnostics-close').click();
    await expect(panel).toBeHidden();
  });
});
