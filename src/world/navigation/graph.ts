import type { AnchorId, LandmarkId, NpcId } from '../../domain/game/types.ts';

export interface Anchor {
  readonly id: AnchorId;
  /** World position on the ground plane (metres). */
  readonly x: number;
  readonly z: number;
  readonly walkable: boolean;
  /** Interaction the anchor stands in front of, if any. */
  readonly npcId: NpcId | null;
  readonly landmarkId: LandmarkId | null;
  readonly labelFa: string;
}

export interface Edge {
  readonly from: AnchorId;
  readonly to: AnchorId;
}

/**
 * Data-defined waypoint graph. Movement is restricted to these anchors, so the
 * child can never walk into geometry and no physics engine is needed.
 */
export const ANCHORS: readonly Anchor[] = [
  {
    id: 'anchor-square',
    x: 0,
    z: 0,
    walkable: true,
    npcId: 'npc-elder',
    landmarkId: 'landmark-square',
    labelFa: 'میدان محله',
  },
  {
    id: 'anchor-path-north',
    x: 0,
    z: -3,
    walkable: true,
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی شمالی',
  },
  {
    id: 'anchor-path-south',
    x: 0,
    z: 3,
    walkable: true,
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی جنوبی',
  },
  {
    id: 'anchor-path-east',
    x: 3,
    z: 0,
    walkable: true,
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی شرقی',
  },
  {
    id: 'anchor-home-gate',
    x: 0,
    z: -6,
    walkable: true,
    npcId: 'npc-neighbour',
    landmarkId: 'landmark-home-gate',
    labelFa: 'در خانه',
  },
  {
    id: 'anchor-shop',
    x: 6,
    z: 0,
    walkable: true,
    npcId: 'npc-shopkeeper',
    landmarkId: 'landmark-shop',
    labelFa: 'مغازه',
  },
  {
    id: 'anchor-garden',
    x: 0,
    z: 6,
    walkable: true,
    npcId: 'npc-gardener',
    landmarkId: 'landmark-garden',
    labelFa: 'باغچه',
  },
  {
    id: 'anchor-friend',
    x: -3,
    z: 2,
    walkable: true,
    npcId: 'npc-child-friend',
    landmarkId: null,
    labelFa: 'دوست',
  },
  {
    id: 'anchor-path-west',
    x: -3,
    z: 0,
    walkable: true,
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی غربی',
  },
  {
    id: 'anchor-fountain',
    x: -6,
    z: 0,
    walkable: false,
    npcId: null,
    landmarkId: 'landmark-fountain',
    labelFa: 'حوض',
  },
];

export const EDGES: readonly Edge[] = [
  { from: 'anchor-square', to: 'anchor-path-north' },
  { from: 'anchor-square', to: 'anchor-path-south' },
  { from: 'anchor-square', to: 'anchor-path-east' },
  { from: 'anchor-square', to: 'anchor-path-west' },
  { from: 'anchor-path-north', to: 'anchor-home-gate' },
  { from: 'anchor-path-east', to: 'anchor-shop' },
  { from: 'anchor-path-south', to: 'anchor-garden' },
  { from: 'anchor-path-west', to: 'anchor-friend' },
  { from: 'anchor-path-west', to: 'anchor-fountain' },
];

const BY_ID = new Map<AnchorId, Anchor>(ANCHORS.map((anchor) => [anchor.id, anchor]));

export function getAnchor(id: AnchorId): Anchor {
  const anchor = BY_ID.get(id);
  if (!anchor) throw new Error(`Unknown anchor: ${id}`);
  return anchor;
}

export function getAnchorOrNull(id: string): Anchor | null {
  return BY_ID.get(id as AnchorId) ?? null;
}

const NEIGHBOURS = (() => {
  const map = new Map<AnchorId, AnchorId[]>(ANCHORS.map((anchor) => [anchor.id, []]));
  for (const edge of EDGES) {
    map.get(edge.from)?.push(edge.to);
    map.get(edge.to)?.push(edge.from);
  }
  return map;
})();

/** Walkable neighbours only; unwalkable anchors are decoration/interaction-only. */
export function neighboursOf(id: AnchorId): readonly AnchorId[] {
  return (NEIGHBOURS.get(id) ?? []).filter((neighbour) => getAnchor(neighbour).walkable);
}

export function distanceBetween(a: Anchor, b: Anchor): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function anchorForNpc(npcId: NpcId): Anchor | null {
  return ANCHORS.find((anchor) => anchor.npcId === npcId) ?? null;
}

export function anchorForLandmark(landmarkId: LandmarkId): Anchor | null {
  return ANCHORS.find((anchor) => anchor.landmarkId === landmarkId) ?? null;
}
