import { expect, test, type Page } from '@playwright/test';

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

test('a production pilot query cannot expose private assets and preserves the procedural fallback', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?assets=meshy');
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect(page.getByTestId('target-fountain')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __gardenMeshyAssets?: Record<string, { status: string }> })
            .__gardenMeshyAssets?.['meshy-garden-fountain']?.status,
      ),
    )
    .toBe('error');
  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  await expect(pageErrors).toEqual([]);
});
