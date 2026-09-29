import type { AnchorId, LandmarkId, NpcId } from '../../domain/game/types.ts';
import type { AreaId } from '../../domain/world/types.ts';

export interface Anchor {
  readonly id: AnchorId;
  /** World position on the ground plane (metres). */
  readonly x: number;
  readonly z: number;
  readonly walkable: boolean;
  /** The world area this anchor belongs to — world content owns an area. */
  readonly areaId: AreaId;
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
 * child can never walk into geometry and no physics engine is needed. Every
 * anchor declares its `areaId`: the world is one coordinate system with area
 * metadata layered on top, and edges crossing an area boundary are how areas
 * connect (portals).
 */
export const ANCHORS: readonly Anchor[] = [
  {
    id: 'anchor-square',
    x: 0,
    z: 0,
    walkable: true,
    areaId: 'area-town',
    npcId: 'npc-elder',
    landmarkId: 'landmark-square',
    labelFa: 'میدان محله',
  },
  {
    id: 'anchor-path-north',
    x: 0,
    z: -3,
    walkable: true,
    areaId: 'area-town',
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی شمالی',
  },
  {
    id: 'anchor-path-south',
    x: 0,
    z: 3,
    walkable: true,
    areaId: 'area-town',
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی جنوبی',
  },
  {
    id: 'anchor-path-east',
    x: 3,
    z: 0,
    walkable: true,
    areaId: 'area-town',
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی شرقی',
  },
  {
    id: 'anchor-home-gate',
    x: 0,
    z: -6,
    walkable: true,
    areaId: 'area-home',
    npcId: 'npc-neighbour',
    landmarkId: 'landmark-home-gate',
    labelFa: 'در خانه',
  },
  {
    id: 'anchor-shop',
    x: 6,
    z: 0,
    walkable: true,
    areaId: 'area-market',
    npcId: 'npc-shopkeeper',
    landmarkId: 'landmark-shop',
    labelFa: 'مغازه',
  },
  {
    id: 'anchor-garden',
    x: 0,
    z: 6,
    walkable: true,
    areaId: 'area-garden',
    npcId: 'npc-gardener',
    landmarkId: 'landmark-garden',
    labelFa: 'باغچه',
  },
  {
    id: 'anchor-friend',
    x: -3,
    z: 2,
    walkable: true,
    areaId: 'area-town',
    npcId: 'npc-child-friend',
    landmarkId: null,
    labelFa: 'دوست',
  },
  {
    id: 'anchor-path-west',
    x: -3,
    z: 0,
    walkable: true,
    areaId: 'area-town',
    npcId: null,
    landmarkId: null,
    labelFa: 'کوچه‌ی غربی',
  },
  {
    id: 'anchor-fountain',
    x: -6,
    z: 0,
    walkable: false,
    areaId: 'area-fountain',
    npcId: null,
    landmarkId: 'landmark-fountain',
    labelFa: 'حوض',
  },
  {
    id: 'anchor-path-west-far',
    x: -8.2,
    z: -2.8,
    walkable: true,
    areaId: 'area-fountain',
    npcId: null,
    landmarkId: null,
    labelFa: 'انتهای کوچه‌ی غربی',
  },
  {
    id: 'anchor-park',
    x: -10,
    z: 0.5,
    walkable: true,
    areaId: 'area-park',
    npcId: 'npc-park-keeper',
    landmarkId: 'landmark-park',
    labelFa: 'پارک',
  },
  {
    id: 'anchor-park-hill',
    x: -12,
    z: -2,
    walkable: true,
    areaId: 'area-park',
    npcId: 'npc-child-sara',
    landmarkId: null,
    labelFa: 'تپه‌ی پارک',
  },
  {
    id: 'anchor-bakery',
    x: 8.4,
    z: -2.4,
    walkable: true,
    areaId: 'area-market',
    npcId: 'npc-baker',
    landmarkId: 'landmark-bakery',
    labelFa: 'نانوایی',
  },
  {
    id: 'anchor-river-path',
    x: 8.5,
    z: 4.2,
    walkable: true,
    areaId: 'area-river',
    npcId: null,
    landmarkId: null,
    labelFa: 'راه رودخانه',
  },
  {
    id: 'anchor-river',
    x: 10.5,
    z: 6.5,
    walkable: true,
    areaId: 'area-river',
    npcId: 'npc-fisher',
    landmarkId: 'landmark-river',
    labelFa: 'رودخانه',
  },
  {
    id: 'anchor-river-bank',
    x: 12.6,
    z: 4.8,
    walkable: true,
    areaId: 'area-river',
    npcId: null,
    landmarkId: null,
    labelFa: 'کنار رودخانه',
  },
  {
    id: 'anchor-path-north-east',
    x: 4.8,
    z: -8.5,
    walkable: true,
    areaId: 'area-school',
    npcId: null,
    landmarkId: null,
    labelFa: 'راه مدرسه',
  },
  {
    id: 'anchor-school',
    x: 7,
    z: -6.5,
    walkable: true,
    areaId: 'area-school',
    npcId: 'npc-teacher',
    landmarkId: 'landmark-school',
    labelFa: 'کلاس',
  },
  {
    id: 'anchor-school-yard',
    x: 9.5,
    z: -8.2,
    walkable: true,
    areaId: 'area-school',
    npcId: 'npc-child-ali',
    landmarkId: null,
    labelFa: 'حیاط کلاس',
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
  { from: 'anchor-path-west', to: 'anchor-path-west-far' },
  { from: 'anchor-path-west-far', to: 'anchor-park' },
  { from: 'anchor-park', to: 'anchor-park-hill' },
  { from: 'anchor-shop', to: 'anchor-bakery' },
  { from: 'anchor-shop', to: 'anchor-river-path' },
  { from: 'anchor-river-path', to: 'anchor-river' },
  { from: 'anchor-river', to: 'anchor-river-bank' },
  { from: 'anchor-home-gate', to: 'anchor-path-north-east' },
  { from: 'anchor-path-north-east', to: 'anchor-school' },
  { from: 'anchor-school', to: 'anchor-school-yard' },
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
