import { ANCHORS, EDGES, getAnchor } from './navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from './worldSource.ts';
import type { DetailLevel } from './models/modelProvider.ts';

/**
 * Fixed authored ground decoration — NOT scatter. Every slot is hand-placed,
 * deterministic, and stable between renders. `minDetail` is the lowest
 * detailLevel at which the slot appears.
 */
export interface GroundDecoration {
  readonly x: number;
  readonly z: number;
  readonly kind: 'flower' | 'stone' | 'plant' | 'patch';
  readonly minDetail: DetailLevel;
  readonly scale?: number;
}

/**
 * Hidden finds — Delight Pass PR 3 micro-discoveries. Each is a physical
 * thing tucked under a leaf pile at a fixed authored spot: a touch parts
 * the cover once and the find stays revealed for the session. Authored
 * with the same clearance discipline as decorations (each asserted clear
 * in tests) so the child can actually walk up and touch it.
 */
export interface HiddenFindSpot {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export const HIDDEN_FINDS: readonly HiddenFindSpot[] = [
  { id: 'find-park', x: 3.6, z: -1.8 },
  { id: 'find-garden', x: -4.2, z: 3.6 },
];

export const GROUND_DECORATIONS: readonly GroundDecoration[] = [
  { x: 2, z: -2.6, kind: 'flower', minDetail: 1 },
  { x: -2.2, z: -2.4, kind: 'plant', minDetail: 1 },
  { x: 2.6, z: 2.6, kind: 'flower', minDetail: 1 },
  { x: 4, z: -2.8, kind: 'stone', minDetail: 1 },
  { x: -2.4, z: -3.8, kind: 'stone', minDetail: 1 },
  { x: 3.6, z: 3.8, kind: 'stone', minDetail: 1 },
  { x: 1.8, z: -5.2, kind: 'plant', minDetail: 1 },
  { x: -4.2, z: 3.4, kind: 'flower', minDetail: 1 },
  { x: -4.8, z: -3.0, kind: 'stone', minDetail: 1 },
  { x: -3.8, z: -3.4, kind: 'patch', minDetail: 1, scale: 2.4 },
  { x: 3.2, z: -4.6, kind: 'patch', minDetail: 1, scale: 2.4 },
  { x: -3, z: 4.6, kind: 'patch', minDetail: 1, scale: 2.4 },
  { x: 2.4, z: 4.6, kind: 'flower', minDetail: 2 },
  { x: -3, z: 3.6, kind: 'stone', minDetail: 2 },
  { x: 5, z: 3.2, kind: 'plant', minDetail: 2 },
  { x: -2.2, z: -5.2, kind: 'flower', minDetail: 2 },
  { x: 4.8, z: 4.8, kind: 'plant', minDetail: 2 },
  { x: -5.4, z: 3, kind: 'flower', minDetail: 2 },
  { x: 5.6, z: -3.4, kind: 'stone', minDetail: 2 },
  // new areas — each slot belongs to an area via its position
  { x: -10.5, z: 4.3, kind: 'flower', minDetail: 1 },
  { x: -9.7, z: -4.2, kind: 'plant', minDetail: 1 },
  { x: -9.2, z: 4.2, kind: 'stone', minDetail: 2 },
  { x: 9, z: 7.6, kind: 'plant', minDetail: 1 },
  { x: 12.8, z: 6.8, kind: 'flower', minDetail: 2 },
  { x: 8.2, z: -9.6, kind: 'stone', minDetail: 1 },
  { x: 10, z: -5.6, kind: 'flower', minDetail: 2 },
];

/**
 * Conservative bounding radius of one decoration's rendered footprint, so
 * validation tests the whole occupied area — not just the slot center.
 * `patch` is a 1×1 plane scaled by `scale`; the organic kinds are roughly
 * unit-sized clusters scaled likewise.
 */
const KIND_FOOTPRINT: Record<GroundDecoration['kind'], number> = {
  patch: 0.55,
  flower: 0.55,
  plant: 0.55,
  stone: 0.5,
};

export function decorationFootprint(slot: GroundDecoration): number {
  return (slot.scale ?? 1) * KIND_FOOTPRINT[slot.kind];
}

interface ExclusionZone {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * Static exclusion envelope: anchors/hotspots/destination markers, NPC
 * standpoints, landmark footprints, the fountain, the keepsake tree, the
 * existing props, and the avatar spawn (anchor-square). The avatar's movement
 * area is covered by the corridor envelope below — fixed data, no per-frame
 * checks against the live avatar position.
 */
const POINT_ZONES: readonly ExclusionZone[] = [
  // anchors (hotspot rings + destination marker live here) — town only:
  // other maps own their own coordinate space and clearance rules.
  ...ANCHORS.filter((a) => a.mapId === 'map-town').map((a) => ({ x: a.x, z: a.z, radius: 1.1 })),
  // NPC standpoints (anchor.x + 0.9, anchor.z - 0.4 in Hub)
  ...ANCHORS.filter((a) => a.npcId !== null && a.mapId === 'map-town').map((a) => ({
    x: a.x + 0.9,
    z: a.z - 0.4,
    radius: 0.9,
  })),
  // quest landmark footprints (anchor.x, anchor.z - 1.2, ~1.4 wide + details)
  ...ANCHORS.filter(
    (a) => a.landmarkId !== null && a.landmarkId !== 'landmark-fountain' && a.mapId === 'map-town',
  ).map((a) => ({ x: a.x, z: a.z - 1.2, radius: 1.5 })),
  // fountain basin
  {
    x: getAnchor(STATIC_WORLD_SOURCE, 'anchor-fountain').x,
    z: getAnchor(STATIC_WORLD_SOURCE, 'anchor-fountain').z,
    radius: 1.9,
  },
  // keepsake tree
  { x: -1.2, z: 1.6, radius: 1.0 },
  // existing props
  { x: 1.4, z: 1.2, radius: 0.7 },
  { x: -1.5, z: -1.1, radius: 0.7 },
  { x: 4.6, z: 1.4, radius: 0.7 },
];

/** Movement corridor: every navigation edge widened to a fixed envelope. */
const CORRIDOR_HALF_WIDTH = 0.85;

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/**
 * True when a decoration footprint centred at (x, z) clears every exclusion
 * zone and corridor. `radius` is the decoration's bounding radius (see
 * `decorationFootprint`) — a footprint-aware check, not just the center.
 */
export function isDecorationClear(x: number, z: number, radius = 0): boolean {
  for (const zone of POINT_ZONES) {
    if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + radius) return false;
  }
  for (const edge of EDGES) {
    const from = getAnchor(STATIC_WORLD_SOURCE, edge.from);
    if (from.mapId !== 'map-town') continue;
    const to = getAnchor(STATIC_WORLD_SOURCE, edge.to);
    if (distToSegment(x, z, from.x, from.z, to.x, to.z) < CORRIDOR_HALF_WIDTH + radius)
      return false;
  }
  return true;
}

/**
 * Swept-clearance check: samples `isDecorationClear` every ≤0.25 world units
 * along the segment from `from` to `to` — bounded resolution, but the 0.25
 * stride is well under the tightest clearance radius in this authored world,
 * so a moving thing (e.g. a critter) cannot meaningfully cross a hotspot,
 * NPC, landmark footprint or path corridor. The zone/corridor data stays
 * private to this module — callers only see the path predicate.
 */
export function isDecorationClearPath(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
  radius = 0,
): boolean {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isDecorationClear(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, radius))
      return false;
  }
  return true;
}
