import { expect, test, type Page } from '@playwright/test';

const saveKey = 'waypoint-rpg:garden-adventure:save';

async function start(page: Page) {
  await page.goto('/?cinematicprobe=1');
  await expect(page.getByTestId('garden-start')).toBeVisible();
  await page.getByTestId('garden-start').click();
  await expect(page.getByTestId('garden-canvas')).toBeVisible();
  await expect(page.getByTestId('scene-village')).toBeVisible();
}

async function interact(page: Page, targetId: string) {
  const target = page.getByTestId(`target-${targetId}`);
  if ((await target.getAttribute('data-nearby')) !== 'true') {
    await target.click();
    await expect(target).toHaveAttribute('data-nearby', 'true');
  }
  await target.click();
}

async function enterGarden(page: Page) {
  await interact(page, 'garden-gate');
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect(page.getByTestId('active-map')).toHaveText('باغ خاموش');
  await expect.poll(() => page.evaluate(() => window.__gardenProbe?.activeMap)).toBe('garden');
}

async function startGuardianPath(page: Page) {
  await interact(page, 'traveler');
  await page.getByTestId('dialogue-choice-meet-traveler').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('نشانی روی سنگ پنهان است');
  await page.getByTestId('dialogue-choice-follow-light').click();
  await enterGarden(page);
  await interact(page, 'guardian');
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  await interact(page, 'clue-stone');
}

async function startGuardianTrial(page: Page) {
  await interact(page, 'guardian');
  await expect(page.getByTestId('dialogue-panel')).toContainText('بازی نوری دوستانه');
  await page.getByTestId('dialogue-choice-challenge-guardian').click();
  await expect(page.getByTestId('battle-layer')).toBeVisible();
  await expect(page.getByTestId('battle-cell-4-2')).toHaveAttribute(
    'data-occupant',
    'guardian-seat',
  );
}

async function readSave(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), saveKey);
}

test('completes the gardener path using package inventory, progression and equipment', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await start(page);

  await interact(page, 'gardener');
  await expect(page.getByTestId('dialogue-panel')).toContainText('چراغ باغ خاموش شده است');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('یک دانه ویژه دارم');
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await expect(page.getByTestId('quest-status')).toContainText('سبد دانه‌ها را در روستا پیدا کن');

  await interact(page, 'seed-basket');
  const inventory = page.getByTestId('inventory-panel');
  await inventory.locator('summary').click();
  await expect(page.getByTestId('inventory-special-seed')).toContainText('دانه ویژه: 1');
  await expect(page.getByTestId('quest-status')).toContainText('دانه را در بستر باغ بکار');
  await enterGarden(page);
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد و باغ دوباره سبز شد');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid="ending-panel"] [data-cinematic-dialogue]')
            ?.getAttribute('data-cinematic-dialogue') === 'tree-ending',
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = window.__gardenEndingCinematicProbe;
        return (
          probe?.endingId === 'ending-garden' &&
          probe.status === 'playing' &&
          Math.hypot(
            probe.cameraPosition[0] - probe.initialCameraPosition[0],
            probe.cameraPosition[1] - probe.initialCameraPosition[1],
            probe.cameraPosition[2] - probe.initialCameraPosition[2],
          ) > 1
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__gardenEndingCinematicProbe?.status))
    .toBe('completed');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = window.__gardenEndingCinematicProbe;
        return (
          probe?.status === 'completed' &&
          Math.hypot(
            probe.cameraPosition[0] - probe.initialCameraPosition[0],
            probe.cameraPosition[1] - probe.initialCameraPosition[1],
            probe.cameraPosition[2] - probe.initialCameraPosition[2],
          ) < 0.01
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  let save = await readSave(page);
  expect(save).toMatchObject({
    schemaVersion: 2,
    mapId: 'garden',
    narrative: {
      quests: { 'gardener-quest': 'completed' },
      facts: { 'tree-grown': true, 'garden-outcome': 'tree' },
      endingId: 'ending-garden',
    },
  });
  expect(JSON.parse(save.gameplay)).toMatchObject({
    inventory: { 'garden-reward': 1, 'lantern-charm': 1 },
    characterProgress: { 'garden-hero': { experience: 24 } },
    equipment: { 'garden-hero': { charm: 'lantern-charm' } },
  });
  await expect(page.getByTestId('hero-progress')).toContainText('مرحله قهرمان: 2');
  await expect(page.getByTestId('unlocked-abilities')).toContainText('شکوفه ستاره‌ای');
  await expect(page.getByTestId('hero-progress')).toContainText('گام‌ها: 3');
  await page.getByTestId('ending-close').click();
  await page.getByTestId('toggle-lantern-charm').click();
  await expect(page.getByTestId('hero-progress')).toContainText('گام‌ها: 2');
  await expect(page.getByTestId('inventory-lantern-charm')).toContainText('آویز فانوس: 1');
  await expect(page.getByTestId('inventory-slots')).toContainText('جای کوله: 2/2');
  await page.getByTestId('toggle-lantern-charm').click();

  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect(page.getByTestId('ending-panel')).toContainText('دانه جوانه زد');
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('grown-tree')),
    )
    .toBe(true);
  await page.getByTestId('ending-close').click();
  save = await readSave(page);
  expect(JSON.parse(save.gameplay).inventory['special-seed']).toBeUndefined();
  expect(pageErrors).toEqual([]);
});

test('dismissing the ending recap cancels the running camera timeline and restores the scene view', async ({
  page,
}) => {
  await start(page);
  await interact(page, 'gardener');
  await page.getByTestId('dialogue-choice-listen-gardener').click();
  await page.getByTestId('dialogue-choice-help-gardener').click();
  await interact(page, 'seed-basket');
  await enterGarden(page);
  await interact(page, 'planting-bed');
  await expect(page.getByTestId('ending-panel')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid="ending-panel"] [data-cinematic-dialogue]')
            ?.getAttribute('data-cinematic-dialogue') === 'tree-ending',
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__gardenEndingCinematicProbe?.status))
    .toBe('playing');

  await page.getByTestId('ending-close').click();
  await expect(page.getByTestId('ending-panel')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__gardenEndingCinematicProbe?.status))
    .toBe('cancelled');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = window.__gardenEndingCinematicProbe;
        return (
          probe?.status === 'cancelled' &&
          Math.hypot(
            probe.cameraPosition[0] - probe.initialCameraPosition[0],
            probe.cameraPosition[1] - probe.initialCameraPosition[1],
            probe.cameraPosition[2] - probe.initialCameraPosition[2],
          ) < 0.01
        );
      }),
    )
    .toBe(true);
});

test('wins a real 5x5 guardian trial and commits its package outcome into the story', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await start(page);
  await startGuardianPath(page);

  await interact(page, 'ancient-lantern');
  await expect(page.getByTestId('ending-panel')).toHaveCount(0);
  await interact(page, 'guardian');
  await page.getByTestId('dialogue-choice-challenge-guardian').click();
  await expect(page.getByTestId('battle-layer')).toBeVisible();
  await expect(page.getByTestId('battle-board')).toBeVisible();
  await expect(page.getByTestId('battle-board').locator('button')).toHaveCount(25);

  const beforeInvalid = JSON.parse((await readSave(page)).gameplay).revision as number;
  await page.getByTestId('battle-ability-light-ray').click();
  await expect(page.getByTestId('battle-notice')).toContainText('این حرکت در این نوبت شدنی نیست');
  expect(JSON.parse((await readSave(page)).gameplay).revision).toBe(beforeInvalid);

  await page.getByTestId('battle-cell-2-2').click();
  await expect(page.getByTestId('battle-statuses')).toContainText('گرده رنگین');
  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await expect(page.getByTestId('battle-layer')).toBeVisible();
  await expect(page.getByTestId('battle-statuses')).toContainText('گرده رنگین');
  await page.getByTestId('battle-ability-gentle-ward').click();
  await expect(page.getByTestId('battle-statuses')).toContainText('درخشش پایدار');
  await page.getByTestId('battle-ability-light-ray').click();
  await expect(page.getByTestId('battle-layer')).toBeVisible();
  await page.getByTestId('battle-ability-light-ray').click();

  await expect(page.getByTestId('ending-panel')).toContainText('فانوس روشن شد و نور به باغ برگشت');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid="ending-panel"] [data-cinematic-dialogue]')
            ?.getAttribute('data-cinematic-dialogue') === 'lantern-ending',
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__gardenEndingCinematicProbe?.endingId === 'ending-lantern' &&
          ['playing', 'completed'].includes(window.__gardenEndingCinematicProbe.status),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('lit-lantern')),
    )
    .toBe(true);
  const save = await readSave(page);
  const gameplay = JSON.parse(save.gameplay);
  expect(gameplay.outcomeMarkers).toEqual([
    expect.objectContaining({ outcome: 'victory', consequenceId: 'guardian-victory' }),
  ]);
  expect(gameplay.appliedRewardIds).toContain(
    `encounter:${gameplay.outcomeMarkers[0].encounterInstanceId}:victory`,
  );
  expect(save.narrative).toMatchObject({
    quests: { 'lantern-quest': 'completed' },
    facts: { 'clue-found': true, 'lantern-lit': true, 'garden-outcome': 'guardian' },
    endingId: 'ending-lantern',
  });

  await page.getByTestId('ending-close').click();
  await page.reload();
  await expect(page.getByTestId('garden-continue')).toBeVisible();
  await page.getByTestId('garden-continue').click();
  await expect(page.getByTestId('scene-garden')).toBeVisible();
  await expect(page.getByTestId('ending-panel')).toContainText('فانوس روشن شد و نور به باغ برگشت');
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenProbe?.renderedConsequences.includes('lit-lantern')),
    )
    .toBe(true);
  expect(pageErrors).toEqual([]);
});

test('Escape withdraws kindly and the guardian offers a retry without losing quest progress', async ({
  page,
}) => {
  await start(page);
  await startGuardianPath(page);
  await startGuardianTrial(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('battle-layer')).toHaveCount(0);
  await expect(page.getByTestId('battle-outcome')).toContainText('دوباره تلاش کن');
  const withdrawn = await readSave(page);
  expect(JSON.parse(withdrawn.gameplay).outcomeMarkers).toEqual([
    expect.objectContaining({ outcome: 'withdrawn', consequenceId: 'guardian-retry' }),
  ]);
  expect(withdrawn.narrative.quests['lantern-quest']).toBe('active');
  expect(withdrawn.narrative.endingId).toBeNull();

  await startGuardianTrial(page);
  const active = await readSave(page);
  expect(JSON.parse(active.gameplay).encounter.outcome).toBeNull();
  expect(JSON.parse(active.gameplay).outcomeMarkers).toHaveLength(1);
});

test('rejects a target ability when the gameplay package reports insufficient starlight', async ({
  page,
}) => {
  await start(page);
  await startGuardianPath(page);
  await startGuardianTrial(page);
  await page.getByTestId('battle-cell-2-2').click();
  await page.getByTestId('battle-ability-gentle-ward').click();
  await page.getByTestId('battle-ability-gentle-ward').click();
  await page.getByTestId('battle-ability-light-ray').click();

  const beforeRejectedAbility = JSON.parse((await readSave(page)).gameplay) as {
    revision: number;
    encounter: { combatants: { id: string; resources: Record<string, number> }[] };
  };
  expect(
    beforeRejectedAbility.encounter.combatants.find((item) => item.id === 'hero-seat')?.resources[
      'starlight'
    ],
  ).toBe(1);
  await page.getByTestId('battle-ability-light-ray').click();
  await expect(page.getByTestId('battle-notice')).toContainText('این حرکت در این نوبت شدنی نیست');
  expect(JSON.parse((await readSave(page)).gameplay).revision).toBe(beforeRejectedAbility.revision);
});
