import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { AnchorId } from '../domain/game/types.ts';
import { getAnchor } from './navigation/graph.ts';
import { findPath, type PathPoint } from './navigation/pathfinding.ts';

const SPEED = 2.6; // metres per second

export interface Walker {
  readonly position: PathPoint;
  readonly heading: number;
  readonly bobbing: number;
  readonly at: AnchorId;
  readonly moving: boolean;
  /**
   * Walk to an anchor. `onArrived`, when given, replaces the hook-level
   * `onArrive` for this walk's final arrival only.
   */
  readonly walkTo: (target: AnchorId, onArrived?: () => void) => boolean;
  readonly cancel: () => void;
}

/**
 * Moves the avatar between waypoints.
 *
 * The canvas renders on demand, so every animated frame explicitly calls
 * `invalidate()`; when the walk finishes the loop goes quiet again.
 */
export function useWalker(
  start: AnchorId,
  onArrive: (anchor: AnchorId) => void,
  enabled: boolean,
): Walker {
  const invalidate = useThree((state) => state.invalidate);
  const startAnchor = getAnchor(start);
  const queue = useRef<AnchorId[]>([]);
  const [position, setPosition] = useState<PathPoint>({ x: startAnchor.x, z: startAnchor.z });
  const [heading, setHeading] = useState(0);
  const [bobbing, setBobbing] = useState(0);
  const [at, setAt] = useState<AnchorId>(start);
  const [moving, setMoving] = useState(false);
  const pendingArrival = useRef<(() => void) | null>(null);

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
    invalidate();
  }, [invalidate]);

  const walkTo = useCallback(
    (target: AnchorId, onArrived?: () => void) => {
      if (!enabled) return false;
      const path = findPath(at, target);
      if (path.length === 0) return false;
      queue.current = [...path.slice(1)];
      pendingArrival.current = onArrived ?? null;
      setMoving(queue.current.length > 0);
      if (queue.current.length === 0) finishWalk(target);
      else invalidate();
      return true;
    },
    [at, enabled, invalidate, finishWalk],
  );

  useEffect(() => {
    // Movement is cancelled by clearing the queue; `moving` settles on the next frame.
    if (!enabled) cancel();
  }, [enabled, cancel]);

  useFrame((_, delta) => {
    const next = queue.current[0];
    if (next === undefined) {
      if (moving) setMoving(false);
      return;
    }
    const target = getAnchor(next);
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    const step = SPEED * Math.min(delta, 0.05);

    if (distance <= step || distance === 0) {
      setPosition({ x: target.x, z: target.z });
      queue.current.shift();
      setAt(next);
      if (queue.current.length === 0) {
        setMoving(false);
        finishWalk(next);
      }
    } else {
      setPosition({
        x: position.x + (dx / distance) * step,
        z: position.z + (dz / distance) * step,
      });
      setHeading(Math.atan2(dx, dz));
      setBobbing((phase) => phase + delta * 9);
    }

    invalidate();
  });

  return {
    position,
    heading,
    bobbing,
    at,
    moving,
    walkTo,
    cancel,
  };
}
