/**
 * Shared Playwright-driving helpers for the QA/measurement scripts
 * (qa-screenshots.ts, measure-perf.ts). Ported from e2e/npcTap.ts with the
 * same interaction contract — trail chips navigate only, a deliberate figure
 * tap opens dialogue, taps resolve through the __WORLD_PROBE hooks — minus
 * the @playwright/test runner imports these scripts cannot use.
 */
import type { Page } from 'playwright';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';
import type { AnchorId, QuestId } from '../src/domain/game/types.ts';
import { getAnchor } from '../src/world/navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from '../src/world/worldSource.ts';
import type { WorldSource } from '../src/domain/world/source.ts';
import { findPath } from '../src/world/navigation/pathfinding.ts';

interface WorldProbe {
  __worldToScreen?: (x: number, z: number, y?: number) => { x: number; y: number };
  __worldScene?: { traverse: (cb: () => void) => void };
  __worldCamera?: { position: { x: number; z: number } };
  __worldCanvasId?: number;
  __worldNpcs?: Record<
    string,
    { anchorId: string; activity: string; dialogueId: string | null; x: number; z: number }
  >;
  __worldAt?: string;
  __worldMapId?: string;
  __worldMoving?: boolean;
  __worldDialogueNpc?: string | null;
  __worldTime?: number;
}

/** enableWorldProbe must run before the first page.goto. */
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

/** Polls `fn` until `pred` accepts or the deadline passes. */
async function poll<T>(
  fn: () => Promise<T>,
  pred: (v: T) => boolean,
  timeout: number,
  interval = 400,
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (pred(v)) return v;
    if (Date.now() > deadline) throw new Error(`poll timed out after ${timeout}ms`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Walks have finished once the walker's own `moving` flag settles. */
export async function waitForWalkerIdle(page: Page, timeout = 60000) {
  await poll(
    () => page.evaluate(() => (window as unknown as WorldProbe).__worldMoving),
    (moving) => moving === false,
    timeout,
  ).catch(() => {});
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

export async function mapId(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldMapId);
}

export async function waitForMap(page: Page, id: string, timeout = 30000) {
  await poll(
    () => mapId(page),
    (m) => m === id,
    timeout,
  );
}

/** On-canvas pixels in and around a world point. */
export async function worldPoints(page: Page, x: number, z: number) {
  return page.evaluate(
    ({ wx, wz }: { wx: number; wz: number }) => {
      const toScreen = (window as unknown as WorldProbe).__worldToScreen!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#world-canvas canvas, .world canvas',
      );
      if (!canvas) return [];
      const offsets: Array<[number, number]> = [
        [0, 0],
        [0, -0.8],
        [0.4, -1.2],
        [0.8, -0.4],
        [-0.8, -0.4],
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

/** NPC id of the currently open dialogue, or null. */
export async function dialogueNpc(page: Page) {
  return page.evaluate(() => (window as unknown as WorldProbe).__worldDialogueNpc ?? null);
}

/** Arriving near an NPC opens their dialogue — close it so taps resume. */
export async function dismissDialogue(page: Page) {
  const dialogue = page.getByTestId('npc-dialogue');
  for (let i = 0; i < 6; i += 1) {
    if (!(await dialogue.isVisible().catch(() => false))) break;
    const close = page.getByTestId('close-dialogue');
    if (await close.isVisible().catch(() => false)) await close.click();
    await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
  // A roaming opponent's figure cylinder can sit under a stray tap — the
  // resulting battle overlay owns all world input until it's left.
  const battle = page.getByTestId('battle-scene');
  if (await battle.isVisible().catch(() => false)) {
    await page.getByTestId('leave-battle').click();
    await battle.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

/**
 * Taps an NPC figure where it currently stands until its dialogue opens.
 * Retries with fresh projections — the routine may move them between reads.
 */
export async function tapNpcFigure(page: Page, npcId: string, timeout = 60000): Promise<boolean> {
  await waitForProbe(page);
  const deadline = Date.now() + timeout;
  const dialogue = page.getByTestId('npc-dialogue');
  let attempt = 0;
  for (;;) {
    if (await dialogue.isVisible().catch(() => false)) {
      const who = await dialogueNpc(page);
      if (who === npcId) return true;
      await page.getByTestId('close-dialogue').click();
      await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
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
    const opened = await dialogue
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      const who = await dialogueNpc(page);
      if (who === npcId) return true;
      await page.getByTestId('close-dialogue').click();
      await dialogue.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(500);
  }
}

/** Parent-gated quality tier change — the hold + close flow. */
export async function setTier(page: Page, tier: string) {
  await page.getByTestId('pause-button').click();
  await page.getByTestId('parent-entry-pause').click();
  const hold = await page.getByTestId('parent-gate-hold').boundingBox();
  if (!hold) throw new Error('parent-gate-hold has no bounding box');
  await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
  await page.mouse.down();
  await page.getByTestId('parent-area').waitFor({ timeout: 8000 });
  await page.mouse.up();
  await page.getByTestId(`quality-${tier}`).click();
  // Closing returns straight to the hub (resumeMode), not the pause menu.
  await page.getByTestId('parent-close').click();
  await page.getByTestId('hud').waitFor();
  await page.getByTestId('world-canvas').waitFor();
}

/** Small screens collapse the quest journey behind a trail-toggle chip. */
export async function expandTrail(page: Page) {
  const toggle = page.getByTestId('trail-toggle');
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await page.getByTestId('quest-trail').waitFor({ state: 'visible' });
}

/**
 * Quest chip → walk → stop → tap the quest's NPC → dialogue opens.
 * The chip itself never talks; this is the whole interaction contract.
 */
export async function openQuestDialogue(page: Page, questId: QuestId, timeout = 120000) {
  const npcId = getQuestDefinition(questId).steps[0]!.npcId;
  await waitForProbe(page);
  const deadline = Date.now() + timeout;
  for (;;) {
    await expandTrail(page);
    await page.getByTestId(`trail-${questId}`).click();
    await waitForWalkerIdle(page, 60000).catch(() => {});
    if (await tapNpcFigure(page, npcId, 20000)) break;
    if (Date.now() > deadline) {
      throw new Error(`${npcId} is not tappable in this layout`);
    }
  }
  await page.getByTestId('npc-dialogue').waitFor({ state: 'visible' });
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
  await poll(
    async () => {
      const a = await cameraTarget(page);
      await page.waitForTimeout(350);
      const b = await cameraTarget(page);
      return Math.hypot(b.x - a.x, b.z - a.z);
    },
    (drift) => drift < 0.01,
    30000,
  );
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
  fromMap: string | undefined,
) {
  const dialogue = page.getByTestId('npc-dialogue');
  for (let i = 0; i < 20; i += 1) {
    const [cur, curMap] = await page.evaluate(() => [
      (window as unknown as WorldProbe).__worldAt,
      (window as unknown as WorldProbe).__worldMapId,
    ]);
    // Crossing a map transition counts: transition anchors (cave door) change
    // the map instead of landing on the tapped anchor.
    if (fromMap !== undefined && curMap !== fromMap) return 'arrived';
    if (cur === to && (cur !== from || i >= 4)) return 'arrived';
    if (cur !== from) return 'moved';
    if (await dialogue.isVisible().catch(() => false)) return 'dialogue';
    if (
      await page
        .getByTestId('battle-scene')
        .isVisible()
        .catch(() => false)
    ) {
      return 'dialogue';
    }
    const still = await page.evaluate(
      () => (window as unknown as WorldProbe).__worldMoving !== true,
    );
    if (still && i >= 3) return 'stuck';
    await page.waitForTimeout(500);
  }
  return 'stuck';
}

/**
 * Taps a world anchor like a child's finger. The follow camera means a far
 * anchor may sit outside the viewport — the helper walks hop-by-hop along
 * the authored path until the target is in view. Throws when untappable.
 */
export async function tapWorldAnchor(
  page: Page,
  anchorId: AnchorId,
  source: WorldSource = STATIC_WORLD_SOURCE,
) {
  await waitForProbe(page);
  await dismissDialogue(page);
  const startMapId = await mapId(page);
  const tried = new Set<AnchorId>();
  for (let attempt = 0; attempt < 14; attempt += 1) {
    await dismissDialogue(page);
    await waitForCameraSettle(page);
    await dismissDialogue(page);
    const at = (await playerAt(page)) as AnchorId | undefined;
    const nowMap = await mapId(page);
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
    // Path hop: follow the visible path to the next anchor toward the target.
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
      hopped = await poll(
        () => playerAt(page),
        (v) => v !== at,
        12000,
      )
        .then(() => true)
        .catch(() => false);
      if (hopped) break;
      tried.add(nextHop.id);
    }
    if (hopped) continue;
    // Greedy fallback: tap the visible walkable anchor nearest the goal.
    const nowMapId = await mapId(page);
    const visible: Array<{ a: WorldSource['anchors'][number]; d: number }> = [];
    for (const candidate of source.anchors) {
      if (!candidate.walkable) continue;
      if (nowMapId !== undefined && candidate.mapId !== nowMapId) continue;
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
      explored = await poll(
        () => playerAt(page),
        (v) => v !== at,
        12000,
      )
        .then(() => true)
        .catch(() => false);
      if (explored) break;
      tried.add(a.id);
    }
    if (!explored) break;
  }
  throw new Error(`${anchorId} is outside the tappable canvas in this layout`);
}
