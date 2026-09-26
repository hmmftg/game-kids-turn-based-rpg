import type { AnchorId } from '../../domain/game/types.ts';
import { ANCHORS, distanceBetween, getAnchor, neighboursOf } from './graph.ts';

/** Nearest *walkable* anchor to a ground-plane point, within an optional radius. */
export function nearestWalkableAnchor(
  x: number,
  z: number,
  maxDistance = Infinity,
): AnchorId | null {
  let best: AnchorId | null = null;
  let bestDistance = maxDistance;
  for (const anchor of ANCHORS) {
    if (!anchor.walkable) continue;
    const distance = Math.hypot(anchor.x - x, anchor.z - z);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = anchor.id;
    }
  }
  return best;
}

/**
 * A* over the waypoint graph. The graph is tiny (tens of nodes), so a linear
 * scan of the open set is cheaper than a heap and allocates nothing per frame.
 */
export function findPath(from: AnchorId, to: AnchorId): readonly AnchorId[] {
  if (from === to) return [from];
  const goal = getAnchor(to);
  if (!goal.walkable) return [];

  const open = new Set<AnchorId>([from]);
  const cameFrom = new Map<AnchorId, AnchorId>();
  const gScore = new Map<AnchorId, number>([[from, 0]]);
  const fScore = new Map<AnchorId, number>([[from, distanceBetween(getAnchor(from), goal)]]);

  while (open.size > 0) {
    let current: AnchorId | null = null;
    let currentScore = Infinity;
    for (const candidate of open) {
      const score = fScore.get(candidate) ?? Infinity;
      if (score < currentScore) {
        currentScore = score;
        current = candidate;
      }
    }
    if (current === null) break;
    if (current === to) return reconstruct(cameFrom, current);

    open.delete(current);
    const currentG = gScore.get(current) ?? Infinity;
    for (const neighbour of neighboursOf(current)) {
      const tentative = currentG + distanceBetween(getAnchor(current), getAnchor(neighbour));
      if (tentative >= (gScore.get(neighbour) ?? Infinity)) continue;
      cameFrom.set(neighbour, current);
      gScore.set(neighbour, tentative);
      fScore.set(neighbour, tentative + distanceBetween(getAnchor(neighbour), goal));
      open.add(neighbour);
    }
  }

  return [];
}

function reconstruct(cameFrom: Map<AnchorId, AnchorId>, goal: AnchorId): readonly AnchorId[] {
  const path: AnchorId[] = [goal];
  let current = goal;
  while (cameFrom.has(current)) {
    current = cameFrom.get(current) as AnchorId;
    path.unshift(current);
  }
  return path;
}

export interface PathPoint {
  readonly x: number;
  readonly z: number;
}

export function pathToPoints(path: readonly AnchorId[]): readonly PathPoint[] {
  return path.map((id) => {
    const anchor = getAnchor(id);
    return { x: anchor.x, z: anchor.z };
  });
}
