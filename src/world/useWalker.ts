import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { AnchorId } from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { getAnchor } from './navigation/graph.ts';
import { findPath, type PathPoint } from './navigation/pathfinding.ts';

const SPEED = 2.6; // metres per second
/** Orientation beat before the first step: the child sees the avatar turn to
 *  face the chosen destination, which is what «that tap meant go there» looks
 *  like. Only held when the turn is large enough to notice. */
const TURN_BEAT_S = 0.22;
const TURN_BEAT_MIN_ANGLE = 0.45; // radians — small corrections turn mid-stride
const TURN_RATE = 14; // radians-per-second ease while walking or glancing
/** How far ahead of the avatar the follow camera looks during a walk — the
 *  next hop enters the frame before the avatar does, so «where I'm going»
 *  stays visible instead of appearing only on arrival. */
const CAMERA_LEAD = 2.4;
/** A dead tap (resolves to no anchor) earns a glance toward it — the honest
 *  physical «I saw that; I can't get there». */
const GLANCE_S = 0.6;

/** Shortest-arc easing between two headings. */
function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
}

function angleDelta(a: number, b: number): number {
  let d = Math.abs(b - a);
  while (d > Math.PI) d = Math.abs(d - 2 * Math.PI);
  return d;
}

export interface Walker {
  readonly position: PathPoint;
  /** Point the follow camera should frame: the live position plus a lead
   *  toward the current hop while walking. Equals `position` when idle. */
  readonly focus: PathPoint;
  readonly heading: number;
  readonly bobbing: number;
  readonly at: AnchorId;
  readonly moving: boolean;
  /**
   * Walk to an anchor. `onArrived`, when given, replaces the hook-level
   * `onArrive` for this walk's final arrival only.
   */
  readonly walkTo: (target: AnchorId, onArrived?: () => void) => boolean;
  /** Turn toward a world point without walking — the «I saw that tap»
   *  response for ground that resolves to no anchor. */
  readonly faceToward: (x: number, z: number) => void;
  readonly cancel: () => void;
}

/**
 * Moves the avatar between waypoints.
 *
 * The canvas renders on demand, so every animated frame explicitly calls
 * `invalidate()`; when the walk finishes the loop goes quiet again.
 */
export function useWalker(
  source: WorldSource,
  start: AnchorId,
  onArrive: (anchor: AnchorId) => void,
  enabled: boolean,
): Walker {
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();
  const startAnchor = getAnchor(source, start);
  const queue = useRef<AnchorId[]>([]);
  const [position, setPosition] = useState<PathPoint>({ x: startAnchor.x, z: startAnchor.z });
  const [focus, setFocus] = useState<PathPoint>({ x: startAnchor.x, z: startAnchor.z });
  const [heading, setHeading] = useState(0);
  const [bobbing, setBobbing] = useState(0);
  const [at, setAt] = useState<AnchorId>(start);
  const [moving, setMoving] = useState(false);
  const pendingArrival = useRef<(() => void) | null>(null);
  // Seconds of orientation-before-step left on a fresh walk: the avatar
  // visibly turns toward the new destination before the first stride.
  const turnHold = useRef(0);
  // Dead-tap glance: face this world point briefly instead of walking.
  const glance = useRef<{ x: number; z: number; until: number } | null>(null);

  // E2E/QA probe: the anchor the avatar currently stands at. Lets scripts
  // observe arrivals without guessing walk durations.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (import.meta.env.DEV || w['__WORLD_PROBE']) {
      w['__worldAt'] = at;
      w['__worldMoving'] = moving;
      w['__worldHeading'] = heading;
    }
  }, [at, moving, heading]);

  const finishWalk = useCallback(
    (anchor: AnchorId) => {
      const pending = pendingArrival.current;
      pendingArrival.current = null;
      if (pending) pending();
      else onArrive(anchor);
    },
    [onArrive],
  );

  const cancel = useCallback(() => {
    queue.current = [];
    pendingArrival.current = null;
    turnHold.current = 0;
    glance.current = null;
    invalidate();
  }, [invalidate]);

  const walkTo = useCallback(
    (target: AnchorId, onArrived?: () => void) => {
      if (!enabled) return false;
      const path = findPath(source, at, target);
      if (path.length === 0) return false;
      queue.current = [...path.slice(1)];
      pendingArrival.current = onArrived ?? null;
      glance.current = null;
      // Big direction changes earn the visible turn beat before stepping;
      // small ones just ease mid-stride.
      const next = queue.current[0];
      if (next !== undefined && !reduced) {
        const hop = getAnchor(source, next);
        const want = Math.atan2(hop.x - position.x, hop.z - position.z);
        turnHold.current = angleDelta(heading, want) > TURN_BEAT_MIN_ANGLE ? TURN_BEAT_S : 0;
      } else {
        turnHold.current = 0;
      }
      setMoving(queue.current.length > 0);
      if (queue.current.length === 0) finishWalk(target);
      else invalidate();
      return true;
    },
    [source, at, enabled, reduced, position, heading, invalidate, finishWalk],
  );

  const faceToward = useCallback(
    (x: number, z: number) => {
      // Ignored mid-walk: a glance stored now would fire on arrival, which
      // reads as the avatar randomly looking somewhere it never meant to.
      // While walking the child's destination is already claimed.
      if (!enabled || moving) return;
      if (reduced) {
        setHeading(Math.atan2(x - position.x, z - position.z));
        invalidate();
        return;
      }
      glance.current = { x, z, until: performance.now() + GLANCE_S * 1000 };
      invalidate();
    },
    [enabled, moving, reduced, position, invalidate],
  );

  useEffect(() => {
    // Movement is cancelled by clearing the queue; `moving` settles on the next frame.
    if (!enabled) cancel();
  }, [enabled, cancel]);

  useFrame((_, delta) => {
    const next = queue.current[0];
    if (next === undefined) {
      if (moving) setMoving(false);
      // Idle glance: a dead tap still earns a visible reaction — the avatar
      // turns to face where the child pointed, then the glance expires.
      const g = glance.current;
      if (g !== null) {
        const want = Math.atan2(g.x - position.x, g.z - position.z);
        const settled = angleDelta(heading, want) < 0.02;
        setHeading(lerpAngle(heading, want, Math.min(1, delta * TURN_RATE)));
        if (settled || performance.now() > g.until) glance.current = null;
        invalidate();
      }
      if (focus.x !== position.x || focus.z !== position.z) setFocus(position);
      return;
    }
    const target = getAnchor(source, next);
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    const step = SPEED * Math.min(delta, 0.05);

    // Orientation beat: hold position while the avatar visibly turns to face
    // the new destination — «I picked that spot» reads before the walk.
    if (turnHold.current > 0) {
      turnHold.current -= delta;
      setHeading(lerpAngle(heading, wantHeading, Math.min(1, delta * TURN_RATE)));
      invalidate();
      return;
    }

    if (distance <= step || distance === 0) {
      setPosition({ x: target.x, z: target.z });
      queue.current.shift();
      setAt(next);
      if (queue.current.length === 0) {
        setMoving(false);
        setFocus({ x: target.x, z: target.z });
        finishWalk(next);
      } else {
        setFocus({ x: target.x, z: target.z });
      }
    } else {
      setPosition({
        x: position.x + (dx / distance) * step,
        z: position.z + (dz / distance) * step,
      });
      setHeading(lerpAngle(heading, wantHeading, Math.min(1, delta * TURN_RATE)));
      setBobbing((phase) => phase + delta * 9);
      // Camera lead: the frame looks ahead of the avatar toward the current
      // hop, so the destination is on screen before arrival — never behind.
      const lead = Math.min(CAMERA_LEAD, distance);
      setFocus({
        x: position.x + (dx / distance) * lead,
        z: position.z + (dz / distance) * lead,
      });
    }

    invalidate();
  });

  return {
    position,
    focus,
    heading,
    bobbing,
    at,
    moving,
    walkTo,
    faceToward,
    cancel,
  };
}
