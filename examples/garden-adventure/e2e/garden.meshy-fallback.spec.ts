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
  const privateRequests: string[] = [];
  const enabledPrivateRouteResponses: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/__meshy/'))
      privateRequests.push(new URL(request.url()).pathname);
  });
  page.on('response', (response) => {
    if (response.headers()['x-waypoint-meshy-pilot'] === 'enabled')
      enabledPrivateRouteResponses.push(response.url());
  });
  await page.goto('/?assets=meshy');
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('scene-village')).toBeVisible();
  await expect(page.getByTestId('target-fountain')).toBeVisible();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  expect(privateRequests.some((path) => /\.glb$/i.test(path))).toBe(false);
  expect(enabledPrivateRouteResponses).toEqual([]);
  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  await expect(pageErrors).toEqual([]);
});
