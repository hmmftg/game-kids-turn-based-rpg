import { expect, test, type Page } from '@playwright/test';

// PR R+ — Research Session Mode. The consent gate is the entry contract:
// ?research=1 never records silently — a parent starts the session (or exits),
// then ordinary play lands structured events in the researchEvents store.

const readEvents = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Array<{ event: string; context: Record<string, unknown> }>>((resolve, reject) => {
        const open = indexedDB.open('mahalle-ye-mehrabani');
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('researchEvents')) {
            open.result.createObjectStore('researchEvents', { autoIncrement: true });
          }
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('researchEvents', 'readonly');
          const req = tx.objectStore('researchEvents').getAll();
          req.onsuccess = () => resolve(req.result as never[]);
          req.onerror = () => reject(req.error);
        };
      }),
  );

test('the consent gate stands between the flag and the game', async ({ page }) => {
  await page.goto('/?research=1');
  // No silent start: the gate explains collection before anything records.
  await expect(page.getByTestId('research-gate')).toBeVisible();
  await expect(page.getByTestId('research-age-3-4')).toBeVisible();
  await expect(page.getByTestId('research-age-5-7')).toBeVisible();
  // Exit strips the flag and lands on the normal build.
  await page.getByTestId('research-exit').click();
  await expect(page.getByTestId('start-button').or(page.getByTestId('profile-select'))).toBeVisible(
    { timeout: 20000 },
  );
  expect(await readEvents(page)).toHaveLength(0);
});

test('a started session records started_game and selected_avatar', async ({ page }) => {
  await page.goto('/?research=1');
  await page.getByTestId('research-age-3-4').click();
  await page.getByTestId('research-start').click();
  // Normal boot continues after consent — same avatar flow as the base game.
  await page.getByTestId('start-button').click();
  await page.getByTestId('avatar-aban').click();
  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 20000 });

  const events = await readEvents(page);
  const types = events.map((e) => e.event);
  expect(types).toContain('started_game');
  expect(types).toContain('selected_avatar');
  // Every event carries the research context — the session's age band stamps.
  const started = events.find((e) => e.event === 'started_game')!;
  expect(started.context.ageBand).toBe('3-4');
});
