import { test, expect, type Page } from '@playwright/test';
import { startGame } from './harness.ts';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnchorId } from '../src/domain/game/types.ts';
import {
  enableWorldProbe,
  playerAt,
  tapWorldAnchor,
  waitForProbe,
  waitForWalkerIdle,
} from './npcTap.ts';

/**
 * H-3 acceptance fixture — the contract's proof point, end to end:
 *
 *   build a new area on map-town (entirely in the builder)
 *   → export JSON
 *   → reload it (import)
 *   → Play preview
 *   → walk the whole reachable graph hop of the new area
 *   → exercise a map transition
 *   → verify the same navigation semantics as the shipped world
 *
 * The builder is a plain query-param mount (`?worldbuilder=1`), so this runs
 * against the production preview build like every other spec.
 */

const BUILDER_URL = '/?worldbuilder=1&research=0';

async function currentMap(page: Page) {
  return page.evaluate(() => (window as unknown as Record<string, unknown>).__worldMapId);
}

/** Field row → input helper: `<Field label>` renders `<span>label</span>` + control. */
function fieldInput(page: Page, label: string) {
  return page
    .getByTestId('builder-inspector')
    .locator(`div:has(> span:text-is("${label}"))`)
    .locator('input, select')
    .first();
}

async function setFieldValue(page: Page, label: string, value: string) {
  const input = fieldInput(page, label);
  await input.fill(value);
}

async function selectArea(page: Page, areaId: string) {
  await page
    .getByTestId('builder-entity-select')
    .selectOption({ value: JSON.stringify({ kind: 'area', id: areaId }) });
}

async function selectAnchor(page: Page, anchorId: string) {
  await page
    .getByTestId('builder-entity-select')
    .selectOption({ value: JSON.stringify({ kind: 'anchor', id: anchorId }) });
}

test.describe('world builder acceptance', () => {
  test('build a new map-town area in the builder, export → import → walk it and transition', async ({
    page,
  }) => {
    test.setTimeout(240000);
    await enableWorldProbe(page);
    await page.goto(BUILDER_URL);
    await expect(page.getByTestId('worldbuilder-app')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('✓ valid')).toBeVisible({ timeout: 30000 });

    // ── 1. Build a new area on map-town entirely through the builder UI ──
    await page.getByTestId('builder-add-area').click();
    const areaHeading = page.getByTestId('builder-inspector').locator('h4', { hasText: 'Area ' });
    await expect(areaHeading).toContainText('Area area-');
    const areaId = ((await areaHeading.textContent()) ?? '').replace('Area ', '').trim();

    await setFieldValue(page, 'bounds minX', '-11');
    await setFieldValue(page, 'bounds maxX', '-8');
    await setFieldValue(page, 'bounds minZ', '-8');
    await setFieldValue(page, 'bounds maxZ', '-5');

    await page.getByTestId('builder-add-anchor').click();
    const anchorHeading = page
      .getByTestId('builder-inspector')
      .locator('h4', { hasText: 'Anchor ' });
    await expect(anchorHeading).toContainText('Anchor anchor-');
    const anchorA = ((await anchorHeading.textContent()) ?? '').replace('Anchor ', '').trim();
    await setFieldValue(page, 'x', '-9.5');
    await setFieldValue(page, 'z', '-6.5');
    await fieldInput(page, 'areaId').selectOption(areaId);

    await page.getByTestId('builder-add-anchor').click();
    const anchorB = ((await anchorHeading.textContent()) ?? '').replace('Anchor ', '').trim();
    await setFieldValue(page, 'x', '-10');
    await setFieldValue(page, 'z', '-7.2');
    await fieldInput(page, 'areaId').selectOption(areaId);

    // Wire the new anchors into the authored graph: B ↔ A, and A into the
    // existing town path so the area is reachable from spawn. Deliberately
    // NOT a placed-NPC anchor — the figure's hit cylinder swallows taps.
    await page.getByTestId('builder-link-target').selectOption(anchorA);
    await page.getByTestId('builder-link-edge').click();
    await selectAnchor(page, anchorA);
    await page.getByTestId('builder-link-target').selectOption('anchor-path-west-far');
    await page.getByTestId('builder-link-edge').click();

    // The new area spawns on its first anchor.
    await selectArea(page, areaId);
    await fieldInput(page, 'spawnAnchorId').selectOption(anchorA);

    await expect(page.getByText('✓ valid')).toBeVisible();

    // ── 2. export → import (the "reload" leg of the acceptance loop) ──
    mkdirSync(join(tmpdir(), 'worldbuilder-e2e'), { recursive: true });
    const exportPath = join(tmpdir(), 'worldbuilder-e2e', 'world-document.json');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    await download.saveAs(exportPath);

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('✓ valid')).toBeVisible();

    const fileChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load JSON' }).click();
    await (await fileChooser).setFiles(exportPath);
    await expect(page.getByText('✓ valid')).toBeVisible();
    // The authored area/anchors are present in the inspector entity list.
    const entitySelect = page.getByTestId('builder-entity-select');
    const anchorOption = (id: string) => `option[value='{"kind":"anchor","id":"${id}"}']`;
    await expect(entitySelect.locator(anchorOption(anchorA))).toHaveCount(1);
    await expect(entitySelect.locator(anchorOption(anchorB))).toHaveCount(1);

    // The imported document still contains the authored area/anchors.
    const importedDoc = JSON.parse(readFileSync(exportPath, 'utf8')) as {
      anchors: { id: string }[];
      areas: { id: string }[];
    };
    expect(importedDoc.areas.some((a) => a.id === areaId)).toBe(true);
    expect(importedDoc.anchors.some((a) => a.id === anchorA)).toBe(true);
    expect(importedDoc.anchors.some((a) => a.id === anchorB)).toBe(true);

    // ── 3. Play preview: walk the new area + exercise the cave transition ──
    await page.getByTestId('builder-play').click();
    await waitForProbe(page);
    await waitForWalkerIdle(page);

    // Recompile the exported document in the spec to drive path hops — the
    // same WorldSource the preview canvas is walking.
    const { parseDocument } = await import('../src/domain/worldbuilder/document.ts');
    const { documentToWorldSource } = await import('../src/worldbuilder/runtimeAdapter.ts');
    const compiled = documentToWorldSource(parseDocument(readFileSync(exportPath, 'utf8')));
    if (!compiled.ok) throw new Error('exported document fails validation');
    const source = compiled.source;

    // Spawn on map-town, then walk the authored graph into the new area.
    expect(await currentMap(page)).toBe('map-town');
    expect(await playerAt(page)).toBe('anchor-square');
    await tapWorldAnchor(page, 'anchor-path-west-far' as AnchorId, source);
    await tapWorldAnchor(page, anchorA as AnchorId, source);
    await tapWorldAnchor(page, anchorB as AnchorId, source);

    // Exercise the authored map transition: walk to the cave entrance, the
    // preview follows it into map-cave exactly like the game.
    await tapWorldAnchor(page, 'anchor-cave-entrance' as AnchorId, source);
    await expect.poll(() => currentMap(page), { timeout: 30000 }).toBe('map-cave');
    await waitForWalkerIdle(page);
    expect(await playerAt(page)).toBe('anchor-cave-mouth');
  });

  // The parent menu offers the builder to adults only: behind the
  // press-and-hold gate, a tools entry navigates to `?worldbuilder=1`.
  test('the parent area opens the world builder', async ({ page }) => {
    await startGame(page);
    await page.getByTestId('pause-button').click();
    await page.getByTestId('parent-entry-pause').click();
    const hold = await page.getByTestId('parent-gate-hold').boundingBox();
    if (!hold) throw new Error('parent-gate-hold has no bounding box');
    await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
    await page.mouse.down();
    await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
    await page.mouse.up();

    await page.getByTestId('open-worldbuilder').click();
    await expect(page.getByTestId('worldbuilder-app')).toBeVisible();
    expect(page.url()).toContain('worldbuilder=1');
  });
});
