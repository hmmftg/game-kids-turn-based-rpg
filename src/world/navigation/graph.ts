import type { AnchorId, LandmarkId, NpcId } from '../../domain/game/types.ts';
import type { WorldSource } from '../../domain/world/source.ts';
import type { Anchor, Edge } from '../../domain/world/types.ts';

// The types live in `domain/world/types.ts` (shared world-structure contract);
// re-exported so existing `./navigation/graph.ts` imports keep working.
export type { Anchor, Edge } from '../../domain/world/types.ts';

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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
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
    mapId: 'map-town',
    npcId: 'npc-child-ali',
    landmarkId: null,
    labelFa: 'حیاط کلاس',
  },
  // The hidden rock in the park: walkable so the child can approach it;
  // `transitionId` makes arriving here reveal then enter the cave.
  {
    id: 'anchor-cave-entrance',
    x: -12.2,
    z: 3.4,
    walkable: true,
    areaId: 'area-park',
    mapId: 'map-town',
    npcId: null,
    landmarkId: null,
    transitionId: 'transition-cave-entrance',
    labelFa: 'سنگ بزرگ',
  },
  // ── map-cave: own local coordinate system, no edges to the outdoor graph ──
  {
    id: 'anchor-cave-mouth',
    x: 0,
    z: 3.2,
    walkable: true,
    areaId: 'area-cave',
    mapId: 'map-cave',
    npcId: null,
    landmarkId: null,
    transitionId: 'transition-cave-exit',
    labelFa: 'دهانه‌ی غار',
  },
  {
    id: 'anchor-cave-pool',
    x: -2.2,
    z: -0.8,
    walkable: true,
    areaId: 'area-cave',
    mapId: 'map-cave',
    npcId: null,
    landmarkId: 'landmark-pool',
    labelFa: 'حوضچه',
  },
  {
    id: 'anchor-cave-crystal',
    x: 2.2,
    z: -1.6,
    walkable: true,
    areaId: 'area-cave',
    mapId: 'map-cave',
    npcId: null,
    landmarkId: 'landmark-crystal',
    labelFa: 'گوهری',
  },
  {
    id: 'anchor-cave-mouse',
    x: 0.6,
    z: 0.6,
    walkable: true,
    areaId: 'area-cave',
    mapId: 'map-cave',
    npcId: 'npc-cave-mouse',
    landmarkId: null,
    labelFa: 'موش غار',
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
  { from: 'anchor-park', to: 'anchor-cave-entrance' },
  { from: 'anchor-park-hill', to: 'anchor-cave-entrance' },
  // Cave-internal paths: the mouth is the hub of the little cavern.
  { from: 'anchor-cave-mouth', to: 'anchor-cave-pool' },
  { from: 'anchor-cave-mouth', to: 'anchor-cave-crystal' },
  { from: 'anchor-cave-mouth', to: 'anchor-cave-mouse' },
  { from: 'anchor-cave-mouse', to: 'anchor-cave-crystal' },
];

// Lookups are source-parameterized (WorldSource carries the anchor/edge
// tables): the same helpers resolve the shipped world and a builder's
// `DocumentWorldSource` identically. Results are memoized per table identity
// so gameplay passes the static source at zero extra cost.
const BY_ID = new WeakMap<readonly Anchor[], Map<AnchorId, Anchor>>();
const NEIGHBOURS = new WeakMap<readonly Edge[], Map<AnchorId, AnchorId[]>>();

function anchorsById(anchors: readonly Anchor[]): Map<AnchorId, Anchor> {
  let byId = BY_ID.get(anchors);
  if (!byId) {
    byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
    BY_ID.set(anchors, byId);
  }
  return byId;
}

function neighboursById(source: WorldSource): Map<AnchorId, AnchorId[]> {
  let byId = NEIGHBOURS.get(source.edges);
  if (!byId) {
    byId = new Map(source.anchors.map((anchor) => [anchor.id, []]));
    for (const edge of source.edges) {
      byId.get(edge.from)?.push(edge.to);
      byId.get(edge.to)?.push(edge.from);
    }
    NEIGHBOURS.set(source.edges, byId);
  }
  return byId;
}

export function getAnchor(source: WorldSource, id: AnchorId): Anchor {
  const anchor = anchorsById(source.anchors).get(id);
  if (!anchor) throw new Error(`Unknown anchor: ${id}`);
  return anchor;
}

export function getAnchorOrNull(source: WorldSource, id: string): Anchor | null {
  return anchorsById(source.anchors).get(id as AnchorId) ?? null;
}

/** Walkable neighbours only; unwalkable anchors are decoration/interaction-only. */
export function neighboursOf(source: WorldSource, id: AnchorId): readonly AnchorId[] {
  return (neighboursById(source).get(id) ?? []).filter(
    (neighbour) => getAnchor(source, neighbour).walkable,
  );
}

export function distanceBetween(a: Anchor, b: Anchor): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function anchorForNpc(source: WorldSource, npcId: NpcId): Anchor | null {
  return source.anchors.find((anchor) => anchor.npcId === npcId) ?? null;
}

export function anchorForLandmark(source: WorldSource, landmarkId: LandmarkId): Anchor | null {
  return source.anchors.find((anchor) => anchor.landmarkId === landmarkId) ?? null;
}
