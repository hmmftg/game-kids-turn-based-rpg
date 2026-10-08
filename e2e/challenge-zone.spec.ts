import { expect, test, type Page } from '@playwright/test';
import type { AnchorId } from '../src/domain/game/types.ts';
import { resumeFromPicker, startGame } from './harness.ts';
import {
  attentionProbe,
  dialogueNpc,
  npcProbe,
  tapWorldAnchor,
  tapWorldGround,
  waitForProbe,
  waitForWalkerIdle,
  walkToChallengeZone,
  worldPoints,
  type WorldProbe,
} from './npcTap.ts';

// The Challenge Zone is reached by tapping the world, not by a button — the
// same probe-driven canvas taps the cave specs use. Full route:
// town → cave entrance (reveal → enter) → deep tunnel (reveal → cross).

function probe(page: Page) {
  const read = () =>
    page.evaluate(() => {
      const w = window as unknown as WorldProbe;
      return {
        __worldMapId: w.__worldMapId,
        __worldAt: w.__worldAt,
        __worldDiscoveries: w.__worldDiscoveries,
      };
    });
  return {
    mapId: () => read().then((w) => w.__worldMapId),
    at: () => read().then((w) => w.__worldAt),
    discoveries: () => read().then((w) => w.__worldDiscoveries),
  };
}

async function waitForMap(page: Page, mapId: string) {
  await expect.poll(() => probe(page).mapId(), { timeout: 30000 }).toBe(mapId);
}

async function waitForAnchor(page: Page, anchorId: string) {
  await expect.poll(() => probe(page).at(), { timeout: 60000 }).toBe(anchorId);
}

async function battleState(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldBattleState ?? null);
}

/** town → cave → tunnel → challenge: the child's own route, taps only. */
const reachChallengeZone = walkToChallengeZone;

/**
 * Taps an opponent's figure where it stands until the battle scene opens —
 * like tapNpcFigure, but the awaited surface is the battle, not a dialogue.
 */
async function tapOpponentFigure(page: Page, npcId: string, timeout = 60000): Promise<boolean> {
  await waitForProbe(page);
  const scene = page.getByTestId('battle-scene');
  const deadline = Date.now() + timeout;
  let attempt = 0;
  for (;;) {
    if (await scene.isVisible().catch(() => false)) return true;
    const npc = await npcProbe(page, npcId);
    const rendered = await page.evaluate((id) => {
      const w = window as unknown as {
        __worldScene?: {
          getObjectByName(n: string):
            | {
                position: { clone(): { x: number; z: number } };
                getWorldPosition(v: { x: number; z: number }): void;
              }
            | undefined;
        };
      };
      const group = w.__worldScene?.getObjectByName(`npc-transit-${id}`);
      if (!group) return null;
      const v = group.position.clone();
      group.getWorldPosition(v);
      return { x: v.x, z: v.z };
    }, npcId);
    const spot = rendered ?? npc;
    const points = spot !== null ? await worldPoints(page, spot.x, spot.z) : [];
    attempt += 1;
    const pt = points.length > 0 ? (points[(attempt - 1) % points.length] ?? null) : null;
    if (pt === null) {
      if (Date.now() > deadline) return false;
      await page.waitForTimeout(800);
      continue;
    }
    await page.mouse.click(pt.x, pt.y);
    const opened = await scene
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(500);
  }
}

/** Where the figure VISIBLY stands right now (the transit body, or probe). */
async function npcSpot(page: Page, npcId: string) {
  const rendered = await page.evaluate((id) => {
    const w = window as unknown as {
      __worldScene?: {
        getObjectByName(n: string):
          | {
              position: { clone(): { x: number; z: number } };
              getWorldPosition(v: { x: number; z: number }): void;
            }
          | undefined;
      };
    };
    const group = w.__worldScene?.getObjectByName(`npc-transit-${id}`);
    if (!group) return null;
    const v = group.position.clone();
    group.getWorldPosition(v);
    return { x: v.x, z: v.z };
  }, npcId);
  const npc = await npcProbe(page, npcId);
  return rendered ?? npc;
}

/**
 * Taps open ground `dist` from the figure — a real walk/face that can never
 * land inside its 0.45 tap cylinder (a stroll can carry the probe's reported
 * spot out from under the tap).
 */
async function tapGroundClearOfNpc(page: Page, npcId: string, dist: number) {
  const spot = await npcSpot(page, npcId);
  expect(spot, `${npcId} should be mounted`).not.toBeNull();
  await tapWorldGround(page, spot!.x + dist, spot!.z);
}

/** Walks beside an NPC's current stand without touching its figure. */
async function walkBesideNpc(page: Page, npcId: string) {
  await tapGroundClearOfNpc(page, npcId, 0.9);
  await waitForWalkerIdle(page);
}

/**
 * First hop off the gate: (0,3.0) resolves to path-1 deterministically — a
 * tap beside the spawn ties 1:1 against the transition anchor, which means
 * "walk back through the tunnel" (tapping the gate means leaving, for a
 * child too). Needed before hop-walking deep anchors in portrait.
 */
async function leaveTheGate(page: Page) {
  await waitForAnchor(page, 'anchor-challenge-entry');
  await tapWorldGround(page, 0, 3.0);
  await waitForAnchor(page, 'anchor-challenge-path-1');
}

/** Hop-walks to an opponent's anchor, then stands beside the figure. */
async function walkToOpponent(page: Page, npcId: string, anchorId: AnchorId) {
  const at = await probe(page).at();
  if (at === 'anchor-challenge-entry') await leaveTheGate(page);
  if ((await probe(page).at()) !== anchorId) {
    await tapWorldAnchor(page, anchorId);
    await waitForAnchor(page, anchorId);
  }
  await walkBesideNpc(page, npcId);
}

/** Plays a 2-heart/3-round challenge battle correctly against the intent pattern. */
async function winBattle(page: Page, intents: readonly ('rest' | 'attack')[]) {
  const scene = page.getByTestId('battle-scene');
  await expect
    .poll(async () => (await battleState(page))?.phase, { timeout: 15000 })
    .toBe('playerChoice');
  for (const intent of intents) {
    const action = intent === 'rest' ? 'battle-action-ball' : 'battle-action-shield';
    await page.getByTestId(action).click();
    await expect
      .poll(async () => (await battleState(page))?.phase, { timeout: 15000 })
      .toBe('playerChoice')
      .catch(() => {});
    const phase = (await battleState(page))?.phase;
    if (phase === 'victory' || phase === 'defeat') break;
    expect(phase).toBe('playerChoice');
  }
  await expect
    .poll(async () => (await battleState(page))?.phase, { timeout: 15000 })
    .toBe('victory');
  await scene.getByTestId('battle-continue').click();
  await expect(scene).toHaveCount(0);
}

test.describe('the Challenge Zone', () => {
  // Portrait hops are slower: every opponent leg is several short walks.
  test.setTimeout(480000);

  test('the tunnel reveals, crosses both ways, and spawns at the gate', async ({ page }) => {
    await startGame(page);
    await reachChallengeZone(page);

    // Reveal + arrival facts persist; the second tunnel arrival travelled.
    expect(await probe(page).discoveries()).toEqual([
      'discovery-cave-entrance',
      'discovery-challenge-tunnel',
    ]);
    await waitForAnchor(page, 'anchor-challenge-entry');

    // The gate leads home: arriving at it again crosses back to the tunnel.
    await tapWorldAnchor(page, 'anchor-challenge-entry');
    await waitForMap(page, 'map-cave');
    await waitForAnchor(page, 'anchor-cave-tunnel');

    // …and back again — no re-reveal, the way just works now.
    await tapWorldAnchor(page, 'anchor-cave-tunnel');
    await waitForMap(page, 'map-challenge');
  });

  test('a child can walk the zone in portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await startGame(page);
    await reachChallengeZone(page);
    await waitForAnchor(page, 'anchor-challenge-entry');
    await leaveTheGate(page);
  });

  test('a child can walk the zone in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 390 });
    await startGame(page);
    await reachChallengeZone(page);
    await leaveTheGate(page);
  });

  test('every opponent: approach does nothing, ground tap does nothing, figure tap starts its battle', async ({
    page,
  }) => {
    await startGame(page);
    await reachChallengeZone(page);
    // Portrait crops the far side of the field — zoom out like a kid
    // scanning the playground so every opponent stays on-canvas.
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();

    const opponents: readonly { npcId: string; battleId: string; anchorId: AnchorId }[] = [
      {
        npcId: 'npc-playful-mouse',
        battleId: 'battle-playful-mouse',
        anchorId: 'anchor-challenge-mouse',
      },
      {
        npcId: 'npc-challenge-bird',
        battleId: 'battle-challenge-bird',
        anchorId: 'anchor-challenge-bird',
      },
      {
        npcId: 'npc-challenge-eagle',
        battleId: 'battle-challenge-eagle',
        anchorId: 'anchor-challenge-eagle',
      },
      {
        npcId: 'npc-challenge-butterfly',
        battleId: 'battle-challenge-butterfly',
        anchorId: 'anchor-challenge-butterfly',
      },
    ];

    for (const { npcId, battleId, anchorId } of opponents) {
      // Arrival beside the opponent: no dialogue, no battle — walking up is
      // not choosing them.
      await walkToOpponent(page, npcId, anchorId);
      await page.waitForTimeout(600);
      expect(await dialogueNpc(page)).toBeNull();
      expect(await battleState(page)).toBeNull();

      // A ground tap near the figure is a walk/face, never a battle.
      await tapGroundClearOfNpc(page, npcId, 1.3);
      await waitForWalkerIdle(page);
      expect(await battleState(page)).toBeNull();

      // A deliberate tap on the figure: exactly one battle, the right one.
      expect(await tapOpponentFigure(page, npcId)).toBe(true);
      await expect(page.getByTestId('battle-scene')).toHaveCount(1);
      expect((await battleState(page))?.battleId).toBe(battleId);
      await page.getByTestId('leave-battle').click();
      await expect(page.getByTestId('battle-scene')).toHaveCount(0);
      await expect.poll(async () => battleState(page)).toBeNull();
    }
  });

  test('a full victory records the world fact and survives a reload', async ({ page }) => {
    await startGame(page);
    await reachChallengeZone(page);

    // Walk to the bird first — the figure must be on-canvas to tap it
    // (portrait crops the far opponents from the spawn view).
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();
    await walkToOpponent(page, 'npc-challenge-bird', 'anchor-challenge-bird');
    expect(await tapOpponentFigure(page, 'npc-challenge-bird')).toBe(true);
    expect((await battleState(page))?.battleId).toBe('battle-challenge-bird');
    await winBattle(page, ['rest', 'attack', 'rest']);
    await expect.poll(() => probe(page).discoveries()).toContain('discovery-challenge-bird');

    // Let the stable-transition autosave commit (IndexedDB write is async)
    // before reloading — a reload racing the write loses the fact.
    await page.waitForTimeout(2000);

    // Reload: the fact and its world change persist — the solved challenger
    // greets the child like a friend (resolveNpcPresentation, never a flag).
    await page.reload();
    await resumeFromPicker(page);
    expect(await probe(page).discoveries()).toContain('discovery-challenge-bird');
    // The save respawns where the child left — inside the zone. Only replay
    // the tunnel route when the save predates the crossing.
    if ((await probe(page).mapId()) !== 'map-challenge') await reachChallengeZone(page);
    // Zoom resets with the page — widen again for the far-side figure taps.
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();
    await walkToOpponent(page, 'npc-challenge-bird', 'anchor-challenge-bird');
    // The bird alternates its perch stand on clock ticks — an arrival that
    // lands beside empty ground ticks the stand away before the cue checks.
    // Re-arrive near the figure until the warm greet lands.
    await expect
      .poll(
        async () => {
          const cue = await attentionProbe(page);
          if (cue?.npcId === 'npc-challenge-bird' && cue.context === 'greets-child') {
            return true;
          }
          const before = await probe(page).at();
          await tapGroundClearOfNpc(page, 'npc-challenge-bird', 1.1);
          await waitForWalkerIdle(page, 15000).catch(() => {});
          if ((await probe(page).at()) === before) {
            // Already sharing the figure's anchor — a re-tap resolves back
            // to the same spot and mints no arrival. Bounce to the neutral
            // path anchor so the next approach is a real arrival.
            await tapWorldGround(page, 0.4, -0.2);
            await waitForWalkerIdle(page, 15000).catch(() => {});
          }
          return false;
        },
        { timeout: 90000 },
      )
      .toBe(true);
  });

  test('the depths open only after a victory opens the way', async ({ page }) => {
    await startGame(page);
    await reachChallengeZone(page);
    await leaveTheGate(page);
    await tapWorldAnchor(page, 'anchor-challenge-butterfly');
    await waitForAnchor(page, 'anchor-challenge-butterfly');

    // Before the fact: tapping the far side walks nowhere — the gated edge
    // is absent from the world the child walks. (0.2,-4.5) resolves to the
    // depths anchor but sits nearer than the butterfly midpoint, which ties
    // 1:1 against the butterfly anchor.
    await tapWorldGround(page, 0.2, -4.5);
    await waitForWalkerIdle(page, 10000).catch(() => {});
    expect(await probe(page).at()).not.toBe('anchor-challenge-depths');

    // Win the butterfly's game → the way to the depths is real now. The
    // depths sit outside the portrait crop — hop-walk the anchor instead.
    expect(await tapOpponentFigure(page, 'npc-challenge-butterfly')).toBe(true);
    await winBattle(page, ['rest', 'rest', 'attack']);
    await tapWorldAnchor(page, 'anchor-challenge-depths');
    await waitForAnchor(page, 'anchor-challenge-depths');
  });

  test('a burst of taps on an opponent still starts exactly one battle', async ({ page }) => {
    await startGame(page);
    await reachChallengeZone(page);
    // Beside the bird first so its figure is on-canvas for the burst.
    await walkToOpponent(page, 'npc-challenge-bird', 'anchor-challenge-bird');
    const npc = await npcProbe(page, 'npc-challenge-bird');
    const pts = npc !== null ? await worldPoints(page, npc.x, npc.z) : [];
    expect(pts.length).toBeGreaterThan(0);
    const pt = pts[0]!;
    await page.evaluate(
      ({ x, y }) => {
        for (let i = 0; i < 5; i += 1) {
          document
            .elementFromPoint(x, y)
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
        }
      },
      { x: pt.x, y: pt.y },
    );
    // Canvas taps are pointer events — mirror a real burst instead.
    for (let i = 0; i < 4; i += 1) await page.mouse.click(pt.x, pt.y);
    await expect(page.getByTestId('battle-scene')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('battle-scene')).toHaveCount(1);
    expect((await battleState(page))?.battleId).toBe('battle-challenge-bird');
  });

  test('the zone works under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page);
    await reachChallengeZone(page);
    await walkToOpponent(page, 'npc-challenge-bird', 'anchor-challenge-bird');
    expect(await tapOpponentFigure(page, 'npc-challenge-bird')).toBe(true);
    await expect
      .poll(async () => (await battleState(page))?.phase, { timeout: 15000 })
      .toBe('playerChoice');
    await page.getByTestId('battle-action-ball').click();
    await expect
      .poll(async () => (await battleState(page))?.phase, { timeout: 15000 })
      .toBe('playerChoice');
    expect((await battleState(page))?.opponentHearts).toBe(1);
    await page.getByTestId('leave-battle').click();
    await expect.poll(async () => battleState(page)).toBeNull();
  });
});
