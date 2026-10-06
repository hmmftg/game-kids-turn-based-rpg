import { expect, test } from '@playwright/test';
import { playQuest, resumeFromPicker, startGame } from './harness.ts';
import { enableWorldProbe } from './npcTap.ts';

// PWA lifecycle: precache → airplane-mode cold start → storage fallback.
// The service worker only registers in production builds; these tests drive
// `npm run preview` (a prod build), so the SW is real.

test.describe('PWA lifecycle', () => {
  test('a cold start fully offline plays from the precache', async ({ page, context }) => {
    test.setTimeout(240000);
    await startGame(page);
    await playQuest(page, 'quest-greeting');
    // `ready` resolves once the install (precache) completes — without this
    // the offline navigation races asset caching.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    await context.setOffline(true);
    // A brand-new page navigation while fully offline — the airplane-mode
    // cold start. The SW's navigateFallback must serve the app, IndexedDB
    // must offer the saved profile, and the world must be playable.
    const fresh = await context.newPage();
    await enableWorldProbe(fresh); // init scripts are per-page, not per-context
    await fresh.goto('/');
    await resumeFromPicker(fresh);
    await expect(fresh.getByTestId('hud')).toBeVisible();
    await playQuest(fresh, 'quest-greeting');
    await context.setOffline(false);
    await fresh.close();
  });

  test('a device whose save storage fails still plays (session-only)', async ({ page }) => {
    test.setTimeout(120000);
    // Break IndexedDB open — the evicted/private-window path: open() never
    // succeeds, so every repository call rejects and boot must fall back to
    // memory saves instead of dead-ending at BOOT_FAILED.
    await page.addInitScript(() => {
      const broken = {
        open: () => {
          const req = {} as IDBOpenDBRequest;
          setTimeout(() => req.onerror?.(new Event('error')), 0);
          return req;
        },
      };
      Object.defineProperty(window, 'indexedDB', { value: broken });
    });
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await page.getByTestId('avatar-aban').click();
    await page.getByTestId('headwear-next').click();
    await expect(page.getByTestId('hud')).toBeVisible();

    // Session-only: a reload must come back to a fresh title, not a saved
    // profile — progress was never persisted anywhere.
    await page.reload();
    await expect(page.getByTestId('start-button')).toBeVisible();
  });
});
