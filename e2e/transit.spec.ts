import { expect, test, type Page } from '@playwright/test';
import type { AnchorId } from '../src/domain/game/types.ts';
import { startGame } from './harness.ts';
import { npcProbe, tapWorldAnchor, waitForProbe } from './npcTap.ts';

/**
 * Routine relocations must be walked, never teleported: an arrival ticks
 * the world clock and an NPC whose resolved stand moves must physically
 * travel the difference — "she is going over there", not "she vanished".
 * The teacher cycles [class, yard, class-turned] between two anchors ~2.7u
 * apart; the school/home tick anchors all sit >3u from every one of her
 * stands, so arrivals there tick the clock without ever holding her
 * (figures hold their spot while the child is beside them — that hold is
 * why Sara can't be the subject here: every park anchor is beside her).
 *
 * The trail recorder runs inside the page at 30 ms and tags each sample
 * with the resolved position — a post-hoc read races the ~1 s stroll, and
 * pre-flip samples legitimately sit at the OLD stand.
 */
interface Trail {
  readonly x: number;
  readonly z: number;
  readonly rx: number | undefined;
  readonly rz: number | undefined;
}

interface TransitProbe {
  __worldScene?: { getObjectByName(name: string): { position: { x: number; z: number } } };
  __worldNpcs?: Record<string, { x: number; z: number }>;
  __transitTrail?: Trail[];
  __transitTimer?: ReturnType<typeof setInterval>;
}

async function startTrail(page: Page, npcId: string) {
  await page.evaluate((name) => {
    const w = window as unknown as TransitProbe;
    w.__transitTrail = [];
    w.__transitTimer = setInterval(() => {
      const group = w.__worldScene?.getObjectByName(`npc-transit-${name}`);
      if (group) {
        w.__transitTrail!.push({
          x: group.position.x,
          z: group.position.z,
          rx: w.__worldNpcs?.[name]?.x,
          rz: w.__worldNpcs?.[name]?.z,
        });
      }
    }, 30);
  }, npcId);
}

async function stopTrail(page: Page): Promise<Trail[]> {
  return page.evaluate(() => {
    const w = window as unknown as TransitProbe;
    if (w.__transitTimer !== undefined) clearInterval(w.__transitTimer);
    return w.__transitTrail ?? [];
  });
}

function maxDistance(trail: readonly Trail[], target: { x: number; z: number }) {
  return trail.reduce((m, p) => Math.max(m, Math.hypot(p.x - target.x, p.z - target.z)), 0);
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * One more arrival = one tick, and Sara's cycle moves her resolved spot on
 * EVERY tick. Hops to the gate and back tick the clock; a tap that lands
 * on a figure instead is an NPC-tap walk (skipArrivalTick — no tick), so
 * retry the hop until the resolved spot provably moved.
 */
async function tickUntilMoved(page: Page, npcId: string, before: { x: number; z: number }) {
  // Ticks must come from arrivals OUT of the teacher's reach: landing
  // within ~3u of her stand holds her in place (people don't stroll away
  // from a visitor — that hold is the regression fix this file co-exists
  // with). Both anchors stay >3u from every teacher stand and keep the
  // school mounted, so each hop ticks the clock and she relocates.
  const destinations: AnchorId[] = ['anchor-path-north-east', 'anchor-home-gate'];
  for (let i = 0; i < 6; i += 1) {
    await tapWorldAnchor(page, destinations[i % destinations.length]!);
    const moved = await expect
      .poll(
        async () => {
          const now = await npcProbe(page, npcId);
          return now === null ? 0 : dist(now, before);
        },
        { timeout: 8000 },
      )
      .toBeGreaterThan(0.3)
      .then(() => true)
      .catch(() => false);
    if (moved) return;
  }
  throw new Error(`world clock never relocated ${npcId}`);
}

test.describe('NPC transit — relocations walk, never teleport', () => {
  test('a tick that moves the stand walks the figure continuously to it', async ({ page }) => {
    test.setTimeout(300000);
    await startGame(page);
    await waitForProbe(page);

    // Walk into the school — the teacher mounts at her current-tick stand.
    await tapWorldAnchor(page, 'anchor-path-north-east');
    const teacherBefore = await npcProbe(page, 'npc-teacher');
    expect(teacherBefore).not.toBeNull();
    const before = { x: teacherBefore!.x, z: teacherBefore!.z };

    await startTrail(page, 'npc-teacher');
    await tickUntilMoved(page, 'npc-teacher', before);
    const teacherAfter = await npcProbe(page, 'npc-teacher');
    const resolved = { x: teacherAfter!.x, z: teacherAfter!.z };

    // Let the stroll finish, then read the trail. Post-flip samples are
    // the ones recorded after the resolved spot moved.
    await page.waitForTimeout(2500);
    const trail = await stopTrail(page);
    const postFlip = trail.filter(
      (p) => p.rx !== undefined && p.rz !== undefined && dist({ x: p.rx, z: p.rz }, before) > 0.3,
    );
    expect(postFlip.length).toBeGreaterThan(5);

    // Walked, not teleported: after the flip the figure was visibly away
    // from the resolved spot and covered real ground to get there.
    expect(maxDistance(postFlip, resolved)).toBeGreaterThan(0.4);
    // ...and it settled exactly ON the resolved stand.
    const last = postFlip[postFlip.length - 1]!;
    expect(dist(last, resolved)).toBeLessThan(0.05);
  });

  test('reduced motion snaps the relocation — meaning kept, motion dropped', async ({ page }) => {
    test.setTimeout(300000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startGame(page);
    await waitForProbe(page);

    await tapWorldAnchor(page, 'anchor-path-north-east');
    const teacherBefore = await npcProbe(page, 'npc-teacher');
    const before = { x: teacherBefore!.x, z: teacherBefore!.z };
    await startTrail(page, 'npc-teacher');
    await tickUntilMoved(page, 'npc-teacher', before);
    const teacherAfter = await npcProbe(page, 'npc-teacher');
    const resolved = { x: teacherAfter!.x, z: teacherAfter!.z };
    await page.waitForTimeout(500);
    const trail = await stopTrail(page);
    const postFlip = trail.filter(
      (p) => p.rx !== undefined && p.rz !== undefined && dist({ x: p.rx, z: p.rz }, before) > 0.3,
    );
    expect(postFlip.length).toBeGreaterThan(0);

    // Reduced motion drops the walk, keeps the meaning: every post-flip
    // sample is already AT the resolved stand.
    expect(maxDistance(postFlip, resolved)).toBeLessThan(0.05);
  });
});
