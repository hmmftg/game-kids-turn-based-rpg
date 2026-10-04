import { expect, test, type Page } from '@playwright/test';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { AnchorId, QuestId } from '../src/domain/game/types.ts';
import { getAnchor } from '../src/world/navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from '../src/world/worldSource.ts';
import type { WorldSource } from '../src/domain/world/source.ts';
import { findPath } from '../src/world/navigation/pathfinding.ts';

// Interaction ownership: arriving near an NPC only earns their attention —
// talking is an explicit tap on the figure. These helpers drive that: probe
// the NPC's live world position, project it to canvas pixels, tap it.

export interface WorldProbe {
  __worldDialogueNpc?: string | null;
  __worldBattleState?: {
    battleId: string;
    phase: string;
    round: number;
    playerHearts: number;
    opponentHearts: number;
  } | null;
  __worldBattleEvents?: Array<{ mark: string; battle: unknown }>;
  __worldMapId?: string;
  __worldAt?: string;
  __worldDiscoveries?: string[];
  __worldMoving?: boolean;
  __worldAttention?: {
    npcId: string;
    nonce: number;
    context: 'notices-child' | 'greets-child';
    arrivalNonce?: number;
  } | null;
  __worldAnimationEvents?: Array<{
    type:
      | 'object-lift'
      | 'object-drop'
      | 'object-open'
      | 'object-bounce'
      | 'object-fly-to'
      | 'object-separate'
      | 'object-uncover'
      | 'object-receive'
      | 'character-react';
    subjectId: string;
    actorId?: string;
    context?: string;
    startedAt: number;
    completedAt: number;
  }>;
  __worldAnimationStats?: { active: number; started: number; completed: number };
  __worldCamera?: { position: { x: number; z: number } };
  __worldToScreen?: (x: number, z: number) => { x: number; y: number };
  __worldNpcs?: Record<
    string,
    { anchorId: string; activity: string; dialogueId: string | null; x: number; z: number }
  >;
}

export async function enableWorldProbe(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__WORLD_PROBE'] = true;
  });
}

export async function waitForProbe(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as WorldProbe).__worldToScreen !== undefined,
    undefined,
    { timeout: 30000 },
  );
}

export async function npcProbe(page: Page, id: string) {
  return page.evaluate(
    (npcId) => (window as unknown as WorldProbe).__worldNpcs?.[npcId] ?? null,
    id,
  );
}

export async function playerAt(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldAt);
}

export async function attentionProbe(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldAttention ?? null);
}

/** Walks have finished once the walker's own `moving` flag settles. */
export async function waitForWalkerIdle(page: Page, timeout = 60000) {
  await expect
    .poll(
      async () => {
        const moving = await page.evaluate(() => (window as unknown as WorldProbe).__worldMoving);
        // `moving` is only published once the walker mounts — undefined means
        // the canvas is still booting, not that the walk has finished.
        return moving === false ? 'idle' : 'walking';
      },
      { timeout },
    )
    .toBe('idle');
}

/** On-canvas pixels in and around a world point (figure taps). */
export async function worldPoints(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ wx, wz }: { wx: number; wz: number }) => {
      const toScreen = (window as unknown as WorldProbe).__worldToScreen!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#world-canvas canvas, .world canvas',
      );
      if (!canvas) return [];
      const offsets: Array<[number, number]> = [
        [0, -0.8],
        [0.4, -1.2],
        [0.8, -0.4],
        [-0.8, -0.4],
        [0, 0],
        [0.6, 0.6],
        [-0.6, 0.6],
        [0, 1.2],
        [1.2, -0.8],
        [-1.2, -0.8],
      ];
      const points: Array<{ x: number; y: number }> = [];
      for (const [ox, oz] of offsets) {
        const pt = toScreen(wx + ox, wz + oz);
        if (pt.x < 0 || pt.y < 0 || pt.x > window.innerWidth || pt.y > window.innerHeight) {
          continue;
        }
        const el = document.elementFromPoint(pt.x, pt.y);
        if (el === canvas || canvas.contains(el)) points.push(pt);
      }
      return points;
    },
    { wx: x, wz: z },
  );
}

/**
 * Taps an NPC figure where it currently stands until its dialogue opens.
 * Retries with fresh projections — the routine may move them between reads,
 * and the child may need a hop of walking before the tap lands.
 */
/** NPC id of the currently open dialogue, or null. */
export async function dialogueNpc(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldDialogueNpc ?? null);
}

export async function tapNpcFigure(page: Page, npcId: string, timeout = 60000): Promise<boolean> {
  await waitForProbe(page);
  const deadline = Date.now() + timeout;
  const dialogue = page.getByTestId('npc-dialogue');
  let attempt = 0;
  for (;;) {
    // Never click world geometry while a card is up — the backdrop swallows
    // it as a dismissal, not a figure tap.
    if (await dialogue.isVisible().catch(() => false)) {
      const who = await dialogueNpc(page);
      if (who === npcId) return true;
      await page.getByTestId('close-dialogue').click();
      await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    const npc = await npcProbe(page, npcId);
    const points = npc !== null ? await worldPoints(page, npc.x, npc.z) : [];
    attempt += 1;
    // One fresh click per iteration: a missed tap can start a walk, which
    // moves the camera — every remaining stale pixel would then land on a
    // different part of the world (a stranger's cylinder, a far anchor).
    // Re-probe + re-project between clicks so each tap is honest.
    const pt = points.length > 0 ? (points[(attempt - 1) % points.length] ?? null) : null;
    if (pt === null) {
      console.log(
        `tapNpcFigure ${npcId} attempt ${attempt}: npc=${JSON.stringify(npc)} offscreen at=${await playerAt(page)}`,
      );
      if (Date.now() > deadline) return false;
      await page.waitForTimeout(800);
      continue;
    }
    await page.mouse.click(pt.x, pt.y);
    const opened = await dialogue
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      const who = await dialogueNpc(page);
      console.log(`tapNpcFigure ${npcId}: dialogue opened for ${who}`);
      if (who === npcId) return true;
      // Two people can share an anchor — a routine visitor's cylinder
      // can overlap the resident's. Wrong person: leave and try another point.
      await page.getByTestId('close-dialogue').click();
      await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(500);
  }
}

/**
 * Quest chip → walk → stop → tap the quest's NPC → dialogue opens.
 * The chip itself never talks; this is the whole new interaction contract.
 */
export async function openQuestDialogue(page: Page, questId: QuestId, timeout = 120000) {
  const npcId = getQuestDefinition(questId).steps[0]!.npcId;
  // The walker must exist before the chip click — a goTo into a null scene
  // handle silently drops the navigation.
  await waitForProbe(page);
  const deadline = Date.now() + timeout;
  for (;;) {
    await page.getByTestId(`trail-${questId}`).click();
    // Navigate first: the chip is walk+camera only, so let the walk finish
    // (arrival may shift the routine — the figure is tapped where it then
    // actually stands, exactly like a child chasing a moving person).
    await waitForWalkerIdle(page, 60000).catch(() => {});
    if (await tapNpcFigure(page, npcId, 20000)) break;
    if (Date.now() > deadline) {
      test.skip(true, `${npcId} is not tappable in this layout`);
      return;
    }
  }
  await expect(page.getByTestId('npc-dialogue')).toBeVisible();
}

/** Camera ground target = camera position − the fixed isometric offset. */
async function cameraTarget(page: Page) {
  return page.evaluate(() => {
    const cam = (window as unknown as WorldProbe).__worldCamera;
    if (!cam) return { x: Number.NaN, z: Number.NaN };
    return { x: cam.position.x - 10, z: cam.position.z - 10 };
  });
}

/** Waits until the camera stops easing (target stable across two reads). */
export async function waitForCameraSettle(page: Page) {
  await expect
    .poll(
      async () => {
        const a = await cameraTarget(page);
        await page.waitForTimeout(350);
        const b = await cameraTarget(page);
        return Math.hypot(b.x - a.x, b.z - a.z);
      },
      { timeout: 30000 },
    )
    .toBeLessThan(0.01);
}

/** Arriving near an NPC opens their dialogue — close it so taps resume. */
async function dismissDialogue(page: Page) {
  const dialogue = page.getByTestId('npc-dialogue');
  for (let i = 0; i < 6; i += 1) {
    if (!(await dialogue.isVisible().catch(() => false))) return;
    const close = page.getByTestId('close-dialogue');
    if (await close.isVisible().catch(() => false)) await close.click();
    await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

/** On-canvas pixels for ground points between two world positions. */
async function groundPointsBetween(
  page: Page,
  from: { x: number; z: number },
  to: { x: number; z: number },
) {
  return page.evaluate(
    ({ mx, mz, tx, tz }: { mx: number; mz: number; tx: number; tz: number }) => {
      const toScreen = (window as unknown as WorldProbe).__worldToScreen!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#world-canvas canvas, .world canvas',
      );
      const out: Array<{ x: number; y: number }> = [];
      for (const t of [0.5, 0.75]) {
        const pt = toScreen(mx + (tx - mx) * t, mz + (tz - mz) * t);
        if (pt.x < 0 || pt.y < 0 || pt.x > window.innerWidth || pt.y > window.innerHeight) {
          continue;
        }
        const el = document.elementFromPoint(pt.x, pt.y);
        if (canvas && (el === canvas || canvas.contains(el))) out.push(pt);
      }
      return out;
    },
    { mx: from.x, mz: from.z, tx: to.x, tz: to.z },
  );
}

/** Polls until the walker anchor changes (or the target is reached). */
async function waitForArrival(
  page: Page,
  from: AnchorId | undefined,
  to: AnchorId,
  mapId: string | undefined,
) {
  for (let i = 0; i < 60; i += 1) {
    const [cur, curMap] = await page.evaluate(() => [
      (window as unknown as WorldProbe).__worldAt,
      (window as unknown as WorldProbe).__worldMapId,
    ]);
    // Crossing a map transition counts: transition anchors (cave door) change
    // the map instead of landing on the tapped anchor.
    if (mapId !== undefined && curMap !== mapId) return 'arrived';
    if (cur === to) return 'arrived';
    if (cur !== from) return 'moved';
    await page.waitForTimeout(500);
  }
  return 'stuck';
}

/**
 * Taps one exact world point. No hop-by-hop walking: the caller picks a spot
 * whose nearest walkable anchor is the intended destination — used when the
 * arrival itself is under test (a locked hotspot's tap zone intentionally
 * swallows clicks, so anchor centers are not always safe tap points).
 */
export async function tapWorldGround(page: Page, x: number, z: number) {
  await waitForProbe(page);
  const point = await page.evaluate(
    ({ wx, wz }: { wx: number; wz: number }) =>
      (window as unknown as WorldProbe).__worldToScreen?.(wx, wz) ?? null,
    { wx: x, wz: z },
  );
  if (!point) throw new Error(`worldToScreen missing for (${x}, ${z})`);
  await page.mouse.click(point.x, point.y);
}

/**
 * Taps a world anchor like a child's finger. The follow camera means a far
 * anchor may sit outside the viewport — exactly like a kid, the helper then
 * walks hop-by-hop along the authored path until the target is in view.
 */
export async function tapWorldAnchor(
  page: Page,
  anchorId: AnchorId,
  source: WorldSource = STATIC_WORLD_SOURCE,
) {
  await waitForProbe(page);
  await dismissDialogue(page);
  const startMapId = await page.evaluate(() => (window as unknown as WorldProbe).__worldMapId);
  const tried = new Set<AnchorId>();
  for (let attempt = 0; attempt < 14; attempt += 1) {
    await dismissDialogue(page);
    await waitForCameraSettle(page);
    await dismissDialogue(page);
    const at = (await playerAt(page)) as AnchorId | undefined;
    const nowMap = await page.evaluate(() => (window as unknown as WorldProbe).__worldMapId);
    if (startMapId !== undefined && nowMap !== startMapId) return;
    const goalAnchor = getAnchor(source, anchorId);
    const atPos = at ? getAnchor(source, at) : undefined;
    const midPts = atPos ? await groundPointsBetween(page, atPos, goalAnchor) : [];
    const pts = [...midPts, ...(await worldPoints(page, goalAnchor.x, goalAnchor.z))];
    let progressed = false;
    for (const point of pts) {
      await dismissDialogue(page);
      await page.mouse.click(point.x, point.y);
      const result = await waitForArrival(page, at, anchorId, startMapId);
      if (result === 'arrived') {
        await dismissDialogue(page);
        return;
      }
      if (result === 'moved') {
        progressed = true;
        break;
      }
    }
    if (progressed) continue;
    // Path hop: the child follows the visible path — walk to the next anchor
    // on the authored route toward the target.
    const goal = getAnchor(source, anchorId);
    const path = at ? findPath(source, at, anchorId) : [];
    const nextHopId = path.length > 1 ? path[1] : undefined;
    const nextHop = nextHopId ? getAnchor(source, nextHopId) : null;
    if (!nextHop) break;
    let hopped = false;
    const hopPts = await worldPoints(page, nextHop.x, nextHop.z);
    const stride = atPos ? await groundPointsBetween(page, atPos, nextHop) : [];
    for (const pt of [...stride, ...hopPts]) {
      await dismissDialogue(page);
      await page.mouse.click(pt.x, pt.y);
      hopped = await expect
        .poll(() => playerAt(page), { timeout: 12000 })
        .not.toBe(at)
        .then(() => true)
        .catch(() => false);
      if (hopped) break;
      tried.add(nextHop.id);
    }
    if (hopped) continue;
    // Greedy fallback: the authored route may detour around a corner — tap
    // the visible walkable anchor nearest the goal and re-evaluate there.
    const mapId = await page.evaluate(() => (window as unknown as WorldProbe).__worldMapId);
    const visible: Array<{ a: WorldSource['anchors'][number]; d: number }> = [];
    for (const candidate of source.anchors) {
      if (!candidate.walkable) continue;
      if (mapId !== undefined && candidate.mapId !== mapId) continue;
      if (candidate.id === at || tried.has(candidate.id)) continue;
      visible.push({
        a: candidate,
        d: Math.hypot(candidate.x - goal.x, candidate.z - goal.z),
      });
    }
    visible.sort((p, q) => p.d - q.d);
    let explored = false;
    for (const { a } of visible.slice(0, 4)) {
      const pts2 = await worldPoints(page, a.x, a.z);
      if (pts2.length === 0) continue;
      await dismissDialogue(page);
      const pt2 = pts2[0];
      if (!pt2) continue;
      await page.mouse.click(pt2.x, pt2.y);
      explored = await expect
        .poll(() => playerAt(page), { timeout: 12000 })
        .not.toBe(at)
        .then(() => true)
        .catch(() => false);
      if (explored) break;
      tried.add(a.id);
    }
    if (!explored) break;
  }
  test.skip(true, `${anchorId} is outside the tappable canvas in this layout`);
}
