import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOUNTAIN_BASIN, nextSeed } from './critters.ts';
import { reactionProbeLog } from './reactions.ts';
import { createCritterController, type Controller } from './useCritters.ts';

/**
 * Lifecycle tests for the ambient controller. `createCritterController` is a
 * pure factory — effects are injected — so scheduling, movement, freezing and
 * resuming are all drivable with fake timers and step() calls, no R3F needed.
 */

function makeController() {
  const moving: Record<string, boolean> = {};
  let invalidateCount = 0;
  const controller = createCritterController({
    reportMoving: (key, m) => {
      moving[key] = m;
    },
    invalidate: () => {
      invalidateCount += 1;
    },
  });
  return { controller, moving, invalidated: () => invalidateCount };
}

function attachFakeNodes(controller: Controller) {
  for (const rt of controller.critters) {
    rt.node = {
      position: { set: () => {} },
      rotation: { y: 0, z: 0 },
    } as unknown as NonNullable<typeof rt.node>;
  }
}

function moveStepUntilIdle(controller: Controller, maxSteps = 4000) {
  // step() clamps delta at 0.05, so each call advances ~50ms of movement.
  for (let i = 0; i < maxSteps; i++) {
    if (!controller.critters.some((c) => c.moving)) return;
    controller.step(0.05);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('critter controller lifecycle', () => {
  it('does not schedule anything while disabled', () => {
    const { controller } = makeController();
    vi.advanceTimersByTime(60_000);
    controller.step(0.05);
    expect(controller.critters.every((c) => !c.moving)).toBe(true);
    expect(controller.critters.every((c) => c.timer === null)).toBe(true);
  });

  it('schedules every critter when enabled', () => {
    const { controller } = makeController();
    controller.setTimersEnabled(true);
    expect(controller.critters.every((c) => c.timer !== null)).toBe(true);
    controller.setTimersEnabled(false);
  });

  it('a timer fire starts a move and arrival reschedules', () => {
    const { controller, moving } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    vi.advanceTimersByTime(60_000); // let the slowest (eagle ≤14s) fire
    expect(controller.critters.some((c) => c.moving)).toBe(true);
    moveStepUntilIdle(controller);
    // Everything that finished got a fresh timer — the system stays alive.
    const settled = controller.critters.filter((c) => !c.moving);
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((c) => c.timer !== null || c.mode === 'soar')).toBe(true);
    expect(Object.values(moving).every((m) => m === false)).toBe(true);
    controller.setTimersEnabled(false);
  });

  it('disabling freezes in-flight critters immediately, not after arrival', () => {
    const { controller, moving } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    vi.advanceTimersByTime(60_000);
    expect(controller.critters.some((c) => c.moving)).toBe(true);
    controller.setTimersEnabled(false);
    expect(controller.critters.every((c) => !c.moving)).toBe(true);
    expect(controller.critters.every((c) => c.timer === null)).toBe(true);
    expect(Object.values(moving).every((m) => m === false)).toBe(true);
    // Frozen critters make no further progress in step().
    const positions = controller.critters.map((c) => [c.x, c.y, c.z]);
    controller.step(0.05);
    for (const [i, c] of controller.critters.entries()) {
      expect([c.x, c.y, c.z]).toEqual(positions[i]);
    }
  });

  it('disabling snaps an in-flight critter back to its last settled spot', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    vi.advanceTimersByTime(60_000);
    const flying = controller.critters.find((c) => c.moving);
    expect(flying).toBeDefined();
    if (!flying) return;
    // Drive it partway along its move so it's genuinely off its rest spot.
    // 3 × 0.05s stays inside even the shortest hop (duration is min 0.4s).
    for (let i = 0; i < 3; i++) controller.step(0.05);
    // it really is mid-flight, not coincidentally at rest
    expect(
      Math.hypot(flying.x - flying.restX, flying.z - flying.restZ) > 0.01 ||
        flying.y !== flying.restY,
    ).toBe(true);
    controller.setTimersEnabled(false);
    expect([flying.x, flying.y, flying.z]).toEqual([flying.restX, flying.restY, flying.restZ]);
    expect(flying.heading).toBe(flying.restHeading);
    expect(flying.spotId).toBe(flying.restSpotId);
    expect(flying.node?.rotation.z).toBe(0);
  });

  it('re-enabling after a freeze restarts scheduling', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    vi.advanceTimersByTime(60_000);
    controller.setTimersEnabled(false);
    controller.setTimersEnabled(true);
    expect(controller.critters.every((c) => c.timer !== null)).toBe(true);
    controller.setTimersEnabled(false);
  });

  it('never lets two fish swim at once', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(10_000);
      const fishMoving = controller.critters.filter((c) => c.kind === 'fish' && c.moving);
      expect(fishMoving.length).toBeLessThanOrEqual(1);
      moveStepUntilIdle(controller);
    }
    controller.setTimersEnabled(false);
  });

  it('a fountain tap darts every fish away from the touch, inside the basin', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    const tap = { x: FOUNTAIN_BASIN.x + 0.1, z: FOUNTAIN_BASIN.z };
    controller.dartFish(tap.x, tap.z);
    const fish = controller.critters.filter((c) => c.kind === 'fish');
    expect(fish.length).toBeGreaterThan(0);
    for (const f of fish) {
      expect(f.moving).toBe(true);
      // Target: far edge from the tap, never outside the basin.
      const dist = Math.hypot(f.to[0] - FOUNTAIN_BASIN.x, f.to[2] - FOUNTAIN_BASIN.z);
      expect(dist).toBeLessThanOrEqual(FOUNTAIN_BASIN.radius + 0.001);
      // The dart heads along the away-from-tap direction, not toward it.
      const awayX = f.x - tap.x;
      const awayZ = f.z - tap.z;
      const dot = (f.to[0] - FOUNTAIN_BASIN.x) * awayX + (f.to[2] - FOUNTAIN_BASIN.z) * awayZ;
      expect(dot).toBeGreaterThan(0);
      expect(f.mode).toBe('swim');
    }
    // The dart resolves and the normal schedule resumes.
    moveStepUntilIdle(controller);
    expect(controller.critters.every((c) => !c.moving)).toBe(true);
    controller.setTimersEnabled(false);
  });

  it('dartFish is a no-op while timers are disabled (frozen ambient layer)', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.dartFish(0, 0);
    expect(controller.critters.every((c) => !c.moving)).toBe(true);
  });

  it('birds reject a ground perch another species is occupying', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    const cat = controller.critters.find((c) => c.key === 'cat-0')!;
    // cat-0's settled spot is ground-ne (2.0, -1.6) — park it there forever.
    expect(cat.x).toBeCloseTo(2.0);
    expect(cat.z).toBeCloseTo(-1.6);
    const birds = controller.critters.filter((c) => c.kind === 'bird');
    // Sweep seeds deterministically: for every possible pick a bird could
    // make from this state, it must never target the cat's ground spot.
    for (const bird of birds) {
      for (let seed = 1; seed < 400; seed = nextSeed(seed)) {
        bird.seed = seed;
        controller.beginMove(bird);
        expect(bird.spotId).not.toBe('ground-ne');
        // A valid alternative must exist (the perch pool is large).
        expect(bird.moving).toBe(true);
        // Snap back deterministically for the next seed sweep.
        bird.moving = false;
        bird.x = bird.restX;
        bird.y = bird.restY;
        bird.z = bird.restZ;
        bird.spotId = bird.restSpotId;
      }
    }
    controller.setTimersEnabled(false);
  });

  it('two birds can never claim the same elevated perch', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    const birds = controller.critters.filter((c) => c.kind === 'bird');
    for (let seed = 1; seed < 400; seed = nextSeed(seed)) {
      for (const bird of birds) {
        bird.seed = seed;
        controller.beginMove(bird);
      }
      const claims = birds.filter((b) => b.moving).map((b) => b.spotId);
      // Settled spotIds + in-flight targets must all be distinct.
      const allClaims = birds.map((b) => b.spotId);
      expect(new Set(allClaims).size).toBe(allClaims.length);
      const elevated = claims.filter((id) => id !== undefined && !id!.startsWith('ground'));
      expect(new Set(elevated).size).toBe(elevated.length);
      for (const bird of birds) {
        bird.moving = false;
        bird.x = bird.restX;
        bird.y = bird.restY;
        bird.z = bird.restZ;
        bird.spotId = bird.restSpotId;
      }
    }
    controller.setTimersEnabled(false);
  });

  it('a bird disabled mid-flight keeps its settled perch reserved', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    vi.advanceTimersByTime(60_000);
    const bird = controller.critters.find((c) => c.kind === 'bird' && c.moving) ?? null;
    expect(bird).not.toBeNull();
    if (!bird) return;
    for (let i = 0; i < 3; i++) controller.step(0.05);
    const settledSpot = bird.restSpotId;
    expect(settledSpot).toBeDefined();
    controller.setTimersEnabled(false);
    // The reservation the snap-back restored is what other critters see.
    expect(bird.spotId).toBe(settledSpot);
    // Re-enable and sweep seeds: no other bird may target that perch.
    controller.setTimersEnabled(true);
    const others = controller.critters.filter((c) => c.kind === 'bird' && c !== bird);
    for (const other of others) {
      for (let seed = 1; seed < 400; seed = nextSeed(seed)) {
        other.seed = seed;
        controller.beginMove(other);
        expect(other.spotId).not.toBe(settledSpot);
        other.moving = false;
        other.x = other.restX;
        other.y = other.restY;
        other.z = other.restZ;
        other.spotId = other.restSpotId;
      }
    }
    controller.setTimersEnabled(false);
  });

  it('keep critters inside CRITTER_BOUNDS while moving', async () => {
    const { CRITTER_BOUNDS } = await import('./critters.ts');
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(20_000);
      for (let s = 0; s < 400; s++) {
        controller.step(0.05);
        for (const c of controller.critters) {
          expect(c.y).toBeLessThanOrEqual(CRITTER_BOUNDS.maxY + 0.01);
          // Horizontal: transit between authored spots is bounded by the
          // widest authored reach (~7.2). CRITTER_BOUNDS.maxHorizontalRadius
          // is only the guaranteed-minimum the camera FIT reserves.
          expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(7.5 + 0.01);
        }
      }
    }
    controller.setTimersEnabled(false);
  });
});

describe('Delight PR 3 — critter reactions', () => {
  it('a settled child in range earns a cat follow hop toward them', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    const cat = controller.critters.find((c) => c.key === 'cat-0')!;
    // Child settles 1.6u south of the cat's spot (2,-1.6) → (2,-3.2).
    controller.noticeCats(2, -3.2);
    expect(cat.moving).toBe(true);
    expect(cat.mode).toBe('dash');
    // One bounded step (≤ CAT_FOLLOW_STEP), aimed at the child.
    const stepDist = Math.hypot(cat.to[0] - cat.x, cat.to[2] - cat.z);
    expect(stepDist).toBeGreaterThan(0);
    expect(stepDist).toBeLessThanOrEqual(0.8 + 1e-9);
    expect(cat.to[0]).toBeCloseTo(2, 5);
    expect(cat.to[2]).toBeCloseTo(-2.3, 5);
    // The hop resolves and the normal patrol schedule resumes.
    moveStepUntilIdle(controller);
    expect(cat.moving).toBe(false);
    expect(cat.timer !== null || !controller.timersEnabled).toBe(true);
    controller.setTimersEnabled(false);
  });

  it('a cat already beside the child just looks — no step', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    const cat = controller.critters.find((c) => c.key === 'cat-0')!;
    controller.noticeCats(2, -2.4); // 0.8u away — under CAT_TOO_CLOSE
    expect(cat.moving).toBe(false);
    expect(cat.heading).toBeCloseTo(Math.PI, 5); // faces -z toward the child
    controller.setTimersEnabled(false);
  });

  it('one arrival produces at most ONE cat response — the nearest cat', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    const before = reactionProbeLog().length;
    // (3,0) is anchor-path-east: cat-0 (2,-1.6) ≈1.9 and cat-1 (4.4,3) ≈3.3
    // are BOTH inside CAT_NOTICE_RADIUS — only the nearest may respond.
    controller.noticeCats(3, 0);
    const cat1 = controller.critters.find((c) => c.key === 'cat-1')!;
    expect(cat1.moving).toBe(false);
    const logged = reactionProbeLog()
      .slice(before)
      .filter((r) => r.reaction === 'follow' || r.reaction === 'notice');
    // Exactly one response globally, and it belongs to the nearer cat —
    // whether it took a step or just looked is the path-safety detail.
    expect(logged.map((r) => r.subject)).toEqual(['cat-0']);
    controller.setTimersEnabled(false);
  });

  it('cats out of range ignore the arrival entirely', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    controller.noticeCats(-8, 8); // far from both patrol pockets
    expect(controller.critters.every((c) => !c.moving)).toBe(true);
    controller.setTimersEnabled(false);
  });

  it('a tapped bird leaves for a deterministic alternate perch', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    const bird = controller.critters.find((c) => c.key === 'bird-0')!;
    expect(bird.spotId).toBe('roof-home');
    controller.startleBird('bird-0');
    expect(bird.moving).toBe(true);
    expect(bird.mode).toBe('hop');
    expect(bird.spotId).toBeDefined();
    expect(bird.spotId).not.toBe('roof-home');
    const perchTarget = bird.spotId;
    moveStepUntilIdle(controller);
    expect(bird.restSpotId).toBe(perchTarget);
    controller.setTimersEnabled(false);
  });

  it('startle never returns the claimed destination or the last settled perch', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.setTimersEnabled(true);
    for (const bird of controller.critters.filter((c) => c.kind === 'bird')) {
      // Sweep seeds so every deterministic candidate pool is exercised —
      // wherever the first candidate IS the departed perch, it must lose.
      for (let seed = 1; seed < 400; seed = nextSeed(seed)) {
        const claimed = bird.spotId;
        const settled = bird.restSpotId;
        bird.seed = seed;
        controller.startleBird(bird.key);
        expect(bird.moving).toBe(true);
        expect(bird.spotId).not.toBe(claimed);
        expect(bird.spotId).not.toBe(settled);
        // Snap back deterministically for the next seed.
        bird.moving = false;
        bird.x = bird.restX;
        bird.y = bird.restY;
        bird.z = bird.restZ;
        bird.spotId = bird.restSpotId;
      }
    }
    controller.setTimersEnabled(false);
  });

  it('the startle pick is deterministic — same state, same perch', () => {
    const a = makeController().controller;
    const b = makeController().controller;
    a.setTimersEnabled(true);
    b.setTimersEnabled(true);
    a.startleBird('bird-1');
    b.startleBird('bird-1');
    expect(a.critters.find((c) => c.key === 'bird-1')!.spotId).toBe(
      b.critters.find((c) => c.key === 'bird-1')!.spotId,
    );
    a.setTimersEnabled(false);
    b.setTimersEnabled(false);
  });

  it('cat/bird reactions are no-ops while timers are disabled', () => {
    const { controller } = makeController();
    attachFakeNodes(controller);
    controller.noticeCats(2, -3.2);
    controller.startleBird('bird-0');
    expect(controller.critters.every((c) => !c.moving)).toBe(true);
  });
});
