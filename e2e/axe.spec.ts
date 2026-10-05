import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { enableWorldProbe } from './npcTap.ts';

/**
 * PR N3 — automated axe checks on every DOM surface a family touches.
 * The 3D world canvas is excluded: axe can't read a framebuffer, and the
 * Nearby sheet is the DOM route that carries the same commands. 3D
 * comprehension stays a human gate — this suite guards the DOM half.
 */

/** WCAG 2.x A/AA on the DOM only; the canvas has no DOM semantics. */
async function analyze(page: Page, scope?: string) {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#world-canvas');
  if (scope !== undefined) builder.include(scope);
  return builder.analyze();
}

async function expectNoViolations(page: Page, surface: string, scope?: string) {
  const results = await analyze(page, scope);
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    `${surface} — axe violations`,
  ).toEqual([]);
}

test.describe('axe — DOM surfaces', () => {
  test('profile picker and avatar creation', async ({ page }) => {
    await enableWorldProbe(page);
    await page.goto('/');
    await expectNoViolations(page, 'landing');

    await page.getByTestId('start-button').click();
    await expectNoViolations(page, 'profile select / avatar picker');

    await page.getByTestId('avatar-aban').click();
    await expectNoViolations(page, 'headwear step');
  });

  test('hub HUD, nearby sheet, and dialogue card', async ({ page }) => {
    await enableWorldProbe(page);
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await page.getByTestId('avatar-aban').click();
    await page.getByTestId('headwear-next').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await expectNoViolations(page, 'hub HUD');

    await page.getByTestId('nearby-button').click();
    await expect(page.getByTestId('nearby-sheet')).toBeVisible();
    await expectNoViolations(page, 'nearby sheet');
    await page.mouse.click(10, 10);

    // A figure-route dialogue: the Nearby sheet dispatches the same command.
    await page.getByTestId('nearby-button').click();
    await page.getByTestId('nearby-npc-elder').click();
    await expect(page.getByTestId('npc-dialogue')).toBeVisible({ timeout: 90000 });
    await expectNoViolations(page, 'dialogue card');
  });

  test('pause menu and parent area gate', async ({ page }) => {
    await enableWorldProbe(page);
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await page.getByTestId('avatar-aban').click();
    await page.getByTestId('headwear-next').click();
    await expect(page.getByTestId('hud')).toBeVisible();

    await page.getByTestId('pause-button').click();
    await expectNoViolations(page, 'pause menu');

    // Parent gate is press-and-hold for 3 s — hold past it.
    await page.getByTestId('parent-entry-pause').click();
    const gate = page.getByTestId('parent-gate-hold');
    await expect(gate).toBeVisible();
    const box = await gate.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(3400);
    await page.mouse.up();
    await expect(page.getByTestId('parent-gate')).toBeHidden({ timeout: 10000 });
    await expectNoViolations(page, 'parent area');
  });
});
