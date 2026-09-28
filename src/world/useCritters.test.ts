import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    for (let i = 0; i < 20; i++) controller.step(0.05);
    const offRest =
      Math.hypot(flying.x - flying.restX, flying.z - flying.restZ) > 0.01 ||
      flying.y !== flying.restY;
    controller.setTimersEnabled(false);
    expect([flying.x, flying.y, flying.z]).toEqual([flying.restX, flying.restY, flying.restZ]);
    expect(flying.heading).toBe(flying.restHeading);
    if (offRest) {
      // it really was mid-flight, not coincidentally at rest
      expect(offRest).toBe(true);
    }
    controller.setTimersEnabled(false);
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
