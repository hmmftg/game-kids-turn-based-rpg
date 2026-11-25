import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import { getQuestCopy } from '../src/content/fa/quests.ts';
import {
  enableWorldProbe,
  expandTrail,
  npcProbe,
  openQuestDialogue,
  tapNpcUntilBattle,
  tapWorldAnchor,
  tapWorldGround,
  waitForProbe,
  waitForWalkerIdle,
} from './npcTap.ts';
import { resumeFromPicker } from './harness.ts';
import { setTier, waitForCameraSettle } from '../scripts/drive-world.ts';

/**
 * Screenshot-only scenario for the real, production-built محله مهربانی game.
 * Not part of the four ordinary E2E shards. Captures are reviewed before
 * documentation promotion; they are never used as exact pixel assertions.
 */
const output = 'docs/previews/legacy-sample';
type SnapshotFilename =
  | '01-title.png'
  | '02-avatar-select.png'
  | '03-headwear-select.png'
  | '04-town-hub.png'
  | '05-town-portrait.png'
  | '06-guardian-dialogue.png'
  | '07-encounter-choice.png'
  | '08-physical-interaction.png'
  | '09-sticker-reward.png'
  | '10-replayed-quest.png'
  | '11-lightweight-battle.png'
  | '12-world-discovery.png'
  | '13-restored-profile.png';
const manifestPath = join(output, 'provenance.json');
const snapshots = [
  '01-title.png',
  '02-avatar-select.png',
  '03-headwear-select.png',
  '04-town-hub.png',
  '05-town-portrait.png',
  '06-guardian-dialogue.png',
  '07-encounter-choice.png',
  '08-physical-interaction.png',
  '09-sticker-reward.png',
  '10-replayed-quest.png',
  '11-lightweight-battle.png',
  '12-world-discovery.png',
  '13-restored-profile.png',
] as const;

async function capture(page: Page, filename: SnapshotFilename, checkpoint: string) {
  mkdirSync(output, { recursive: true });
  const path = join(output, filename);
  await page.screenshot({ path, fullPage: true, animations: 'disabled', caret: 'hide' });
  const bytes = readFileSync(path);
  expect(statSync(path).size, `Unexpectedly small screenshot: ${filename}`).toBeGreaterThan(5_000);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(300);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(300);
  return {
    file: filename,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    checkpoint,
  };
}

async function savedProfile(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('mahalle-ye-mehrabani');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const profiles = (await new Promise<readonly { id: string }[]>((resolve, reject) => {
      const request = db
        .transaction('progress', 'readonly')
        .objectStore('progress')
        .get('profiles');
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    })) as readonly { id: string }[];
    const first = profiles[0];
    if (!first) return null;
    return new Promise<{
      quests: Record<string, { status: string; completionCount: number }>;
      discoveries: string[];
      mapId: string;
      mapAnchorId: string;
    } | null>((resolve, reject) => {
      const request = db
        .transaction('progress', 'readonly')
        .objectStore('progress')
        .get(`profile:${first.id}`);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  });
}

async function probe(page: Page) {
  return page.evaluate(() => {
    const world = window as unknown as {
      __worldMapId?: string;
      __worldAt?: string;
      __worldDiscoveries?: string[];
      __worldBattleState?: { battleId: string; phase: string; round: number } | null;
    };
    return {
      mapId: world.__worldMapId,
      anchorId: world.__worldAt,
      discoveries: world.__worldDiscoveries ?? [],
      battle: world.__worldBattleState ?? null,
    };
  });
}

test.setTimeout(600_000);

test('capture genuine library-backed Kids RPG preview states', async ({ page }) => {
  const dirtySource = execFileSync(
    'git',
    ['status', '--porcelain', '--', 'src', 'public', 'index.html', 'vite.config.ts'],
    { encoding: 'utf8' },
  );
  expect(dirtySource, 'Commit Kids RPG runtime files before recording screenshot provenance').toBe(
    '',
  );
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  expect(sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  const captures: Awaited<ReturnType<typeof capture>>[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await enableWorldProbe(page);
  await page.goto('/?research=0');
  await expect(page.getByTestId('start-button')).toBeVisible();
  captures.push(await capture(page, '01-title.png', 'title screen is ready'));

  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('avatar-aban')).toBeVisible();
  captures.push(await capture(page, '02-avatar-select.png', 'avatar selection is ready'));

  await page.getByTestId('avatar-aban').click();
  await expect(page.getByTestId('headwear-next')).toBeVisible();
  captures.push(await capture(page, '03-headwear-select.png', 'headwear selection is ready'));

  await page.getByTestId('headwear-next').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.getByTestId('world-canvas').locator('canvas')).toBeVisible();

  // Choose a deterministic visible quality tier through the real parent UI.
  await setTier(page, 'normal');
  await waitForCameraSettle(page);
  captures.push(await capture(page, '04-town-hub.png', 'village canvas is rendered'));

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByTestId('hud')).toBeVisible();
  await waitForCameraSettle(page);
  captures.push(await capture(page, '05-town-portrait.png', 'portrait HUD remains visible'));

  await page.setViewportSize({ width: 880, height: 420 });
  await openQuestDialogue(page, 'quest-greeting');
  await expect(page.getByTestId('npc-dialogue')).toBeVisible();
  captures.push(await capture(page, '06-guardian-dialogue.png', 'greeting NPC dialogue is open'));

  await page.getByTestId('start-quest').click();
  await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __worldAnimationStats?: { active: number } })
            .__worldAnimationStats?.active ?? 0,
      ),
    )
    .toBe(0);
  captures.push(
    await capture(page, '07-encounter-choice.png', 'greeting quest asks for its physical choice'),
  );

  const greetingSteps = getQuestDefinition('quest-greeting').steps;
  const greetingStep = greetingSteps[0]!;
  await page.getByTestId(`scene-${greetingStep.correctIconId}`).click();
  await expect(page.getByTestId('encounter-response')).toBeVisible();
  await expect(page.locator(`[data-consequence="${greetingStep.correctIconId}"]`)).toBeVisible();
  captures.push(
    await capture(
      page,
      '08-physical-interaction.png',
      `correct physical choice committed: ${greetingStep.id}`,
    ),
  );

  const secondGreetingStep = greetingSteps[1]!;
  await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`scene-${secondGreetingStep.correctIconId}`).click();
  await expect(page.getByTestId('quest-celebration')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('celebration-sticker')).toBeVisible();
  captures.push(
    await capture(page, '09-sticker-reward.png', 'greeting quest completion and sticker reward'),
  );
  await page.getByTestId('celebration-continue').click();
  await expect(page.getByTestId('quest-celebration')).toBeHidden();

  await expect
    .poll(async () => savedProfile(page), { timeout: 30_000 })
    .toMatchObject({ quests: { 'quest-greeting': { status: 'completed', completionCount: 1 } } });
  // Match the established offline replay path: resume the completed profile
  // before deliberately starting the same repeatable quest again.
  await page.reload();
  await resumeFromPicker(page);
  await waitForProbe(page);
  await expandTrail(page);
  await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
  await openQuestDialogue(page, 'quest-greeting');
  await page.getByTestId('start-quest').click();
  await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 30_000 });
  captures.push(
    await capture(
      page,
      '10-replayed-quest.png',
      'previously completed greeting quest has been replayed into a real encounter',
    ),
  );
  for (const [stepIndex, step] of greetingSteps.entries()) {
    await expect(page.getByTestId('encounter-choice')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('encounter-choice')).toContainText(
      getQuestCopy('quest-greeting').steps[stepIndex]!.promptFa,
    );
    await page.getByTestId(`scene-${step.correctIconId}`).click();
    await expect(page.getByTestId('encounter-response')).toBeVisible();
    await expect(page.locator(`[data-consequence="${step.correctIconId}"]`)).toBeVisible();
    await expect(page.getByTestId('encounter-choice')).toBeHidden({ timeout: 10_000 });
  }
  await expect
    .poll(async () => savedProfile(page), { timeout: 30_000 })
    .toMatchObject({ quests: { 'quest-greeting': { status: 'completed', completionCount: 2 } } });
  const replayCelebration = page.getByTestId('celebration-continue');
  const replayCelebrated = await replayCelebration
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (replayCelebrated) await replayCelebration.click();
  await expect(page.getByTestId('quest-celebration')).toBeHidden();
  await expandTrail(page);
  await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');

  await tapWorldAnchor(page, 'anchor-cave-entrance');
  await expect
    .poll(async () => (await probe(page)).discoveries)
    .toContain('discovery-cave-entrance');
  await expect.poll(async () => (await probe(page)).mapId).toBe('map-town');
  captures.push(
    await capture(page, '12-world-discovery.png', 'cave entrance discovery is committed in town'),
  );

  // Continue through the real map transitions. The entrance was revealed
  // above, so this first tap now enters the cave.
  await tapWorldAnchor(page, 'anchor-cave-entrance');
  await expect.poll(async () => (await probe(page)).mapId).toBe('map-cave');
  await tapWorldAnchor(page, 'anchor-cave-tunnel');
  await tapWorldAnchor(page, 'anchor-cave-tunnel');
  await expect.poll(async () => (await probe(page)).mapId).toBe('map-challenge');

  await page.getByTestId('pause-button').click();
  await page.getByTestId('zoom-out').click();
  await page.getByTestId('zoom-out').click();
  await page.getByTestId('resume-button').click();
  await tapWorldAnchor(page, 'anchor-challenge-bird');
  const bird = await npcProbe(page, 'npc-challenge-bird');
  expect(bird, 'challenge bird should be registered in the current scene').not.toBeNull();
  await tapWorldGround(page, bird!.x + 0.9, bird!.z);
  await waitForWalkerIdle(page);
  await expect(await tapNpcUntilBattle(page, 'npc-challenge-bird')).toBe(true);
  await expect
    .poll(async () => (await probe(page)).battle?.phase, { timeout: 15_000 })
    .toBe('playerChoice');
  await expect.poll(async () => (await probe(page)).battle?.battleId).toBe('battle-challenge-bird');
  captures.push(
    await capture(page, '11-lightweight-battle.png', 'real bird encounter is at playerChoice'),
  );

  for (const actionId of ['battle-action-ball', 'battle-action-shield', 'battle-action-ball']) {
    await page.getByTestId(actionId).click();
    await expect
      .poll(async () => (await probe(page)).battle?.phase, { timeout: 15_000 })
      .toMatch(/playerChoice|victory|defeat/);
    const phase = (await probe(page)).battle?.phase;
    if (phase === 'victory' || phase === 'defeat') break;
    expect(phase).toBe('playerChoice');
  }
  await expect
    .poll(async () => (await probe(page)).battle?.phase, { timeout: 15_000 })
    .toBe('victory');
  await page.getByTestId('battle-continue').click();
  await expect(page.getByTestId('battle-scene')).toHaveCount(0);
  await expect
    .poll(async () => (await probe(page)).discoveries)
    .toContain('discovery-challenge-bird');

  await expect
    .poll(async () => savedProfile(page), { timeout: 30_000 })
    .toMatchObject({
      quests: { 'quest-greeting': { status: 'completed', completionCount: 2 } },
      discoveries: expect.arrayContaining(['discovery-cave-entrance', 'discovery-challenge-bird']),
      mapId: 'map-challenge',
    });
  await page.reload();
  await resumeFromPicker(page);
  await waitForProbe(page);
  await expect.poll(async () => (await probe(page)).mapId).toBe('map-challenge');
  await expect
    .poll(async () => (await probe(page)).discoveries)
    .toEqual(expect.arrayContaining(['discovery-cave-entrance', 'discovery-challenge-bird']));
  await expandTrail(page);
  await expect(page.getByTestId('trail-quest-greeting')).toContainText('انجام شد');
  await expect
    .poll(async () => savedProfile(page))
    .toMatchObject({ quests: { 'quest-greeting': { completionCount: 2 } } });
  captures.push(
    await capture(
      page,
      '13-restored-profile.png',
      'reloaded profile restores quest and discoveries',
    ),
  );

  expect(pageErrors, 'Unhandled browser errors during preview capture').toEqual([]);
  expect(captures.map((image) => image.file).sort()).toEqual([...snapshots].sort());
  const manifest = {
    schemaVersion: 1,
    sourceCommit,
    images: captures.sort((a, b) => a.file.localeCompare(b.file)),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
});
