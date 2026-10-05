import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import type { DetailLevel } from './models/modelProvider.ts';
import {
  BIRD_PERCHES,
  CAT_FOOTPRINT,
  CAT_PATROLS,
  CRITTER_BOUNDS,
  EAGLE_ORBIT,
  EAGLE_PERCHES,
  FOUNTAIN_BASIN,
  INITIAL_CRITTER_PLACEMENTS,
  catPathIsSafe,
  nextSeed,
  pickSpot,
  seedUnit,
  type CritterKind,
} from './critters.ts';
import type { Xyz } from './models/details.tsx';

/**
 * Ambient animal motion under `frameloop="demand"`.
 *
 * All runtime state lives in a lazily-created `Controller` object held in a
 * ref — nothing is read or written during render. A single `useFrame` advances
 * active critters and calls `invalidate()` only while at least one is moving.
 * React state (`movingMap`) changes ONLY on coarse idle↔moving transitions,
 * so per-frame position updates never re-render React. Idle critters are free.
 *
 * Species behaviours:
 *  cat:   idle → dash between patrol spots → sit → idle
 *  bird:  perch → parabolic hop to another perch → idle
 *  eagle: perch → takeoff hop → soar laps → land hop → idle
 *  fish:  pause → short swim burst along a basin arc → pause (≤1 active)
 */

const CAT_SPEED = 3.2;
const BIRD_SPEED = 4.5;
const EAGLE_SPEED = 3.0;
const EAGLE_SOAR_ANGULAR = 0.55; // rad/s — a lap ≈ 11.4 s
const EAGLE_SOAR_LAPS = 2;
const FISH_SPEED = 0.9;

const IDLE_RANGE: Record<CritterKind, readonly [number, number]> = {
  cat: [2000, 6000],
  bird: [3000, 8000],
  eagle: [8000, 14000],
  fish: [1200, 4000],
};

type MoveMode = 'idle' | 'dash' | 'hop' | 'soar' | 'swim';

interface RuntimeCritter {
  readonly key: string;
  readonly kind: CritterKind;
  readonly poolIndex: number;
  node: THREE.Group | null;
  x: number;
  y: number;
  z: number;
  heading: number;
  phase: number;
  mode: MoveMode;
  moving: boolean;
  t: number;
  from: Xyz;
  to: Xyz;
  duration: number;
  seed: number;
  /** Currently claimed spot id — excluded when other critters pick targets. */
  spotId: string | undefined;
  soarAngle: number;
  soarDone: number;
  /** Last settled transform — where the critter returns when motion disables. */
  restSpotId: string | undefined;
  restX: number;
  restY: number;
  restZ: number;
  restHeading: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface Controller {
  critters: RuntimeCritter[];
  timersEnabled: boolean;
  fishMoving: boolean;
  beginMove: (rt: RuntimeCritter) => void;
  schedule: (rt: RuntimeCritter, delay: number) => void;
  arrive: (rt: RuntimeCritter) => void;
  step: (delta: number) => void;
  setTimersEnabled: (active: boolean) => void;
  dartFish: (fromX: number, fromZ: number) => void;
}

export interface CritterView {
  readonly key: string;
  readonly kind: CritterKind;
  readonly tint: string | undefined;
  readonly moving: boolean;
  readonly register: (node: THREE.Group | null) => void;
}

interface ControllerEffects {
  readonly reportMoving: (key: string, moving: boolean) => void;
  readonly invalidate: () => void;
}

function idleDelay(kind: CritterKind, seed: number): number {
  const [lo, hi] = IDLE_RANGE[kind];
  return lo + seedUnit(seed) * (hi - lo);
}

/**
 * Pure factory — the R3F hook below wires the effects; unit tests drive this
 * directly with fake timers, so the whole lifecycle (schedule → move → arrive
 * → reschedule → freeze → resume) is verifiable outside React.
 */
export function createCritterController(effects: ControllerEffects): Controller {
  const critters: RuntimeCritter[] = INITIAL_CRITTER_PLACEMENTS.map((p) => ({
    key: p.key,
    kind: p.kind,
    poolIndex: p.poolIndex,
    node: null,
    x: p.position[0],
    y: p.position[1],
    z: p.position[2],
    heading: p.rotationY,
    phase: 0,
    mode: 'idle',
    moving: false,
    t: 0,
    from: p.position,
    to: p.position,
    duration: 1,
    seed: p.seed,
    spotId: p.spotId,
    soarAngle: 0,
    soarDone: 0,
    restSpotId: p.spotId,
    restX: p.position[0],
    restY: p.position[1],
    restZ: p.position[2],
    restHeading: p.rotationY,
    timer: null,
  }));

  const controller: Controller = {
    critters,
    timersEnabled: false,
    fishMoving: false,
    beginMove: () => {},
    schedule: () => {},
    arrive: () => {},
    step: () => {},
    setTimersEnabled: () => {},
    dartFish: () => {},
  };

  const setMoving = (rt: RuntimeCritter, moving: boolean) => {
    if (rt.moving === moving) return;
    rt.moving = moving;
    // Coarse transition is the only React render a critter ever triggers.
    effects.reportMoving(rt.key, moving);
    effects.invalidate();
  };

  const claimedSpots = (): Set<string | undefined> => new Set(critters.map((c) => c.spotId));

  const startHop = (
    rt: RuntimeCritter,
    target: Xyz,
    speed: number,
    mode: MoveMode,
    spotId?: string,
  ) => {
    rt.from = [rt.x, rt.y, rt.z];
    rt.to = target;
    rt.t = 0;
    const dist = Math.hypot(target[0] - rt.x, target[2] - rt.z, target[1] - rt.y);
    rt.duration = Math.max(0.4, dist / speed);
    rt.mode = mode;
    rt.heading = Math.atan2(target[0] - rt.x, target[2] - rt.z);
    rt.spotId = spotId;
    setMoving(rt, true);
  };

  controller.schedule = (rt, delay) => {
    if (!controller.timersEnabled) return;
    rt.timer = setTimeout(() => {
      rt.timer = null;
      rt.seed = nextSeed(rt.seed);
      controller.beginMove(rt);
    }, delay);
  };

  controller.beginMove = (rt) => {
    if (!controller.timersEnabled) return;
    const claimed = claimedSpots();
    claimed.delete(rt.spotId);
    switch (rt.kind) {
      case 'cat': {
        const patrol = CAT_PATROLS[rt.poolIndex];
        if (!patrol) return;
        const current = patrol.findIndex(
          (s) => Math.abs(s.x - rt.x) < 0.01 && Math.abs(s.z - rt.z) < 0.01,
        );
        const pool = patrol
          .map((spot, i) => ({ spot, i }))
          .filter(({ i }) => i !== current && !claimed.has(`cat-${rt.poolIndex}-${i}`));
        const safe = pool.filter(({ spot }) => catPathIsSafe({ x: rt.x, z: rt.z }, spot));
        if (safe.length === 0) {
          controller.schedule(rt, idleDelay(rt.kind, rt.seed));
          return;
        }
        const pick = safe[Math.floor(seedUnit(rt.seed) * safe.length)] ?? safe[0];
        if (!pick) return;
        startHop(
          rt,
          [pick.spot.x, 0, pick.spot.z],
          CAT_SPEED,
          'dash',
          `cat-${rt.poolIndex}-${pick.i}`,
        );
        break;
      }
      case 'bird': {
        // Ground perches compete with cats (and other birds) by location, not
        // by spot id — exclude any ground perch near another critter's
        // current or resting position.
        const occupiedNear = (p: { readonly position: Xyz }) =>
          critters.some(
            (other) =>
              other !== rt &&
              Math.hypot(other.x - p.position[0], other.z - p.position[2]) < CAT_FOOTPRINT + 0.2,
          );
        const pool = BIRD_PERCHES.filter((p) => p.host !== 'ground' || !occupiedNear(p));
        const perch = pickSpot(rt.seed, pool, new Set([...claimed, rt.spotId]));
        if (!perch) {
          controller.schedule(rt, idleDelay(rt.kind, rt.seed));
          return;
        }
        startHop(rt, perch.position, BIRD_SPEED, 'hop', perch.id);
        break;
      }
      case 'eagle': {
        // Perch → take off to the orbit's nearest point → soar → land.
        const entry: Xyz = [
          Math.cos(rt.soarAngle) * EAGLE_ORBIT.rx,
          EAGLE_ORBIT.minY,
          Math.sin(rt.soarAngle) * EAGLE_ORBIT.rz,
        ];
        rt.soarDone = 0;
        startHop(rt, entry, EAGLE_SPEED, 'hop');
        break;
      }
      case 'fish': {
        if (controller.fishMoving) {
          // Global alternation token: at most one fish bursts at a time.
          controller.schedule(rt, 600 + idleDelay(rt.kind, rt.seed));
          return;
        }
        controller.fishMoving = true;
        const angle = seedUnit(rt.seed) * Math.PI * 2;
        const radius = rt.key === 'fish-0' ? FOUNTAIN_BASIN.radius : FOUNTAIN_BASIN.radius * 0.65;
        startHop(
          rt,
          [
            FOUNTAIN_BASIN.x + Math.cos(angle) * radius,
            FOUNTAIN_BASIN.waterY,
            FOUNTAIN_BASIN.z + Math.sin(angle) * radius,
          ],
          FISH_SPEED,
          'swim',
        );
        break;
      }
    }
  };

  controller.arrive = (rt) => {
    rt.mode = 'idle';
    if (rt.kind === 'fish') controller.fishMoving = false;
    // Eagle mid-flight chain: reaching the orbit entry starts the soar
    // (a landing hop carries a spotId, a takeoff hop does not).
    if (rt.kind === 'eagle' && rt.spotId === undefined) {
      rt.mode = 'soar';
      effects.invalidate();
      return;
    }
    rt.restSpotId = rt.spotId;
    rt.restX = rt.x;
    rt.restY = rt.y;
    rt.restZ = rt.z;
    rt.restHeading = rt.heading;
    setMoving(rt, false);
    controller.schedule(rt, idleDelay(rt.kind, nextSeed(rt.seed)));
  };

  /**
   * Fountain tap reaction: every fish darts away from the touch toward the
   * far basin edge — "fish notices the child" in one bounded burst, then the
   * normal pause/swim schedule resumes. Idle fish and swimmers both retarget;
   * targets stay inside the basin no matter where the tap landed.
   */
  controller.dartFish = (fromX, fromZ) => {
    if (!controller.timersEnabled) return;
    for (const rt of critters) {
      if (rt.kind !== 'fish') continue;
      if (rt.timer) {
        clearTimeout(rt.timer);
        rt.timer = null;
      }
      const dx = rt.x - fromX;
      const dz = rt.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      const radius = FOUNTAIN_BASIN.radius * 0.85;
      startHop(
        rt,
        [
          FOUNTAIN_BASIN.x + (dx / len) * radius,
          FOUNTAIN_BASIN.waterY,
          FOUNTAIN_BASIN.z + (dz / len) * radius,
        ],
        FISH_SPEED * 2.6,
        'swim',
      );
    }
  };

  controller.step = (delta) => {
    const step = Math.min(delta, 0.05);
    let anyMoving = false;
    for (const rt of critters) {
      if (!rt.moving || rt.node === null) continue;
      anyMoving = true;
      rt.phase += step * 10;

      if (rt.mode === 'soar') {
        rt.soarAngle += EAGLE_SOAR_ANGULAR * step;
        rt.soarDone += EAGLE_SOAR_ANGULAR * step;
        rt.x = Math.cos(rt.soarAngle) * EAGLE_ORBIT.rx;
        rt.z = Math.sin(rt.soarAngle) * EAGLE_ORBIT.rz;
        rt.y =
          EAGLE_ORBIT.minY +
          (EAGLE_ORBIT.maxY - EAGLE_ORBIT.minY) * (0.5 + 0.5 * Math.sin(rt.soarAngle * 2));
        rt.heading = Math.atan2(
          -Math.sin(rt.soarAngle) * EAGLE_ORBIT.rx,
          Math.cos(rt.soarAngle) * EAGLE_ORBIT.rz,
        );
        if (rt.soarDone >= Math.PI * 2 * EAGLE_SOAR_LAPS) {
          const perch = pickSpot(rt.seed, EAGLE_PERCHES, claimedSpots());
          rt.seed = nextSeed(rt.seed);
          startHop(rt, perch?.position ?? [0, EAGLE_ORBIT.minY, 0], EAGLE_SPEED, 'hop', perch?.id);
        }
      } else {
        rt.t += step / rt.duration;
        const t = Math.min(1, rt.t);
        const ease = t * t * (3 - 2 * t);
        rt.x = rt.from[0] + (rt.to[0] - rt.from[0]) * ease;
        rt.z = rt.from[2] + (rt.to[2] - rt.from[2]) * ease;
        const base = rt.from[1] + (rt.to[1] - rt.from[1]) * ease;
        if (rt.mode === 'hop') {
          const arc = Math.min(1.6, CRITTER_BOUNDS.maxY - Math.max(rt.from[1], rt.to[1]) - 0.05);
          rt.y = base + Math.sin(Math.PI * t) * Math.max(0.2, arc);
        } else if (rt.mode === 'swim') {
          rt.y = base + Math.sin(Math.PI * t) * 0.08;
        } else {
          rt.y = base + Math.abs(Math.sin(rt.phase)) * 0.05; // dash bob
        }
        if (t >= 1) controller.arrive(rt);
      }

      rt.node.position.set(rt.x, rt.y, rt.z);
      rt.node.rotation.y = rt.heading;
      // Gentle roll while moving — pose flourish, no skeletal animation.
      rt.node.rotation.z = rt.moving ? Math.sin(rt.phase) * 0.06 : 0;
    }
    if (anyMoving) effects.invalidate();
  };

  controller.setTimersEnabled = (active) => {
    controller.timersEnabled = active;
    if (!active) {
      // Freeze the whole system: pending schedules die AND in-flight moves
      // stop immediately, so disabling truly costs zero frames.
      for (const rt of critters) {
        if (rt.timer) clearTimeout(rt.timer);
        rt.timer = null;
        if (rt.moving) {
          rt.mode = 'idle';
          if (rt.kind === 'fish') controller.fishMoving = false;
          // Drop the never-arrived target; restore the spot the critter is
          // visually snapped back to so it stays logically reserved.
          rt.spotId = rt.restSpotId;
          // Snap back to the last settled transform — never leave a critter
          // parked mid-air in a perched pose.
          rt.x = rt.restX;
          rt.y = rt.restY;
          rt.z = rt.restZ;
          rt.heading = rt.restHeading;
          if (rt.node) {
            rt.node.position.set(rt.x, rt.y, rt.z);
            rt.node.rotation.y = rt.heading;
            rt.node.rotation.z = 0;
          }
          setMoving(rt, false);
        }
      }
      effects.invalidate();
      return;
    }
    for (const rt of critters) {
      if (rt.timer === null && !rt.moving) {
        rt.seed = nextSeed(rt.seed);
        controller.schedule(rt, idleDelay(rt.kind, rt.seed));
      }
    }
  };

  return controller;
}

export function useCritters(
  enabled: boolean,
  detailLevel: DetailLevel,
  dartFocus?: { readonly nonce: number; readonly x: number; readonly z: number },
): CritterView[] {
  const invalidate = useThree((state) => state.invalidate);
  const controllerRef = useRef<Controller | null>(null);
  const [movingMap, setMovingMap] = useState<Record<string, boolean>>({});

  // Lazily builds the whole controller on first non-render use. Only refs and
  // stable setters are captured, so this never re-creates runtime state.
  const getController = useCallback((): Controller => {
    if (controllerRef.current) return controllerRef.current;
    const controller = createCritterController({
      reportMoving: (key, moving) => setMovingMap((map) => ({ ...map, [key]: moving })),
      invalidate,
    });
    controllerRef.current = controller;
    return controller;
  }, [invalidate]);

  useFrame((_, delta) => {
    controllerRef.current?.step(delta);
  });

  // Scheduler lifecycle: timers only while enabled AND detail > 0.
  useEffect(() => {
    const controller = getController();
    controller.setTimersEnabled(enabled && detailLevel > 0);
    return () => controller.setTimersEnabled(false);
  }, [enabled, detailLevel, getController]);

  // Fountain tap → fish dart away from the touch. Nonce-keyed like the rest
  // of the liveliness contract: one dart per tap, never per render.
  const dartNonce = dartFocus?.nonce ?? 0;
  const dartX = dartFocus?.x ?? 0;
  const dartZ = dartFocus?.z ?? 0;
  useEffect(() => {
    if (dartNonce === 0) return;
    getController().dartFish(dartX, dartZ);
  }, [dartNonce, dartX, dartZ, getController]);

  // Dev-only QA hook: lets measure/QA scripts read critter transforms without
  // a production test hook or animation loop. Stripped from builds entirely.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as {
      __worldCritterTransforms?: () => readonly (readonly [
        string,
        number,
        number,
        number,
        number,
      ])[];
    };
    w.__worldCritterTransforms = () =>
      getController().critters.map((c) => [c.key, c.x, c.y, c.z, c.heading]);
    return () => {
      delete w.__worldCritterTransforms;
    };
  }, [getController]);

  // Views are built from module-level placements + the React-side moving
  // snapshot — no ref access during render.
  const views = useMemo<CritterView[]>(
    () =>
      INITIAL_CRITTER_PLACEMENTS.map((p) => ({
        key: p.key,
        kind: p.kind,
        tint: p.tint,
        moving: movingMap[p.key] ?? false,
        register: (node: THREE.Group | null) => {
          const rt = getController().critters.find((c) => c.key === p.key);
          if (!rt) return;
          rt.node = node;
          if (node) {
            node.position.set(rt.x, rt.y, rt.z);
            node.rotation.y = rt.heading;
          }
        },
      })),
    [movingMap, getController],
  );

  return views;
}

export type { CritterKind };
