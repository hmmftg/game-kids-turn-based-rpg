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

  test('a corrupted save is quarantined and boot continues', async ({ page }) => {
    test.setTimeout(120000);
    // Seed garbage into the legacy save slot before first boot. parseSave
    // must classify it as corrupt → health 'recovered' → title shows the
    // parent-facing notice instead of crashing on the parse.
    await page.goto('/');
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('mahalle-ye-mehrabani', 1);
          open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains('progress')) {
              open.result.createObjectStore('progress');
            }
          };
          open.onsuccess = () => {
            const tx = open.result.transaction('progress', 'readwrite');
            tx.objectStore('progress').put({ notASave: true, junk: '{{{' }, 'save');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error('seed failed'));
          };
          open.onerror = () => reject(new Error('open failed'));
        }),
    );
    await page.reload();
    // Boot must continue to a playable title with the corrupt-save notice —
    // parents will not debug storage errors.
    await expect(page.getByTestId('start-button')).toBeVisible();
    await expect(page.getByText('پیشرفت قبلی خوانده نشد. می‌توانی از اول شروع کنی.')).toBeVisible();
    await page.getByTestId('start-button').click();
    await page.getByTestId('avatar-aban').click();
    await page.getByTestId('headwear-next').click();
    await expect(page.getByTestId('hud')).toBeVisible();
  });
});
