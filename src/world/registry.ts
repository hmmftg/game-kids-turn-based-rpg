import type { AnchorId, NpcId } from '../domain/game/types.ts';
import type {
  AreaId,
  Bounds,
  NpcDefinition,
  NpcScheduleSpot,
  NpcSimState,
  WorldArea,
} from '../domain/world/types.ts';
import { ANCHORS, EDGES, getAnchor } from './navigation/graph.ts';

/**
 * World registries: logical areas layered over the single world coordinate
 * system, and the data-driven NPC table. Everything here is serialisable data
 * or pure derivation — no React or Three.js.
 *
 * Adding content is a data task:
 * - new area  → a `WorldArea` + anchors tagged with its `areaId` in graph.ts
 * - new NPC   → an `NpcDefinition` + an anchor + copy (`content/fa`) + look
 *   (`world/npcLooks.ts`) rows
 * Areas connect through normal waypoint edges that cross area bounds; no
 * per-area coordinate system exists.
 */
export const WORLD_AREAS: readonly WorldArea[] = [
  {
    id: 'area-town',
    labelFa: 'میدان محله',
    bounds: { minX: -4.6, maxX: 4.6, minZ: -4.6, maxZ: 4.6 },
    spawnAnchorId: 'anchor-square',
  },
  {
    id: 'area-home',
    labelFa: 'محله‌ی خانه',
    bounds: { minX: -4, maxX: 4, minZ: -9, maxZ: -4.6 },
    spawnAnchorId: 'anchor-home-gate',
  },
  {
    id: 'area-market',
    labelFa: 'بازار محله',
    bounds: { minX: 4.6, maxX: 10, minZ: -4, maxZ: 3.6 },
    spawnAnchorId: 'anchor-shop',
  },
  {
    id: 'area-garden',
    labelFa: 'باغچه',
    bounds: { minX: -4, maxX: 5.2, minZ: 4.6, maxZ: 9 },
    spawnAnchorId: 'anchor-garden',
  },
  {
    id: 'area-fountain',
    labelFa: 'کنار حوض',
    bounds: { minX: -8.5, maxX: -4.6, minZ: -3.4, maxZ: 3.4 },
    spawnAnchorId: 'anchor-path-west-far',
  },
  {
    id: 'area-park',
    labelFa: 'پارک',
    bounds: { minX: -13.5, maxX: -8.5, minZ: -4.5, maxZ: 5 },
    spawnAnchorId: 'anchor-park',
  },
  {
    id: 'area-river',
    labelFa: 'کنار رودخانه',
    bounds: { minX: 6.5, maxX: 13.5, minZ: 3.6, maxZ: 9.5 },
    spawnAnchorId: 'anchor-river-path',
  },
  {
    id: 'area-school',
    labelFa: 'کلاس',
    bounds: { minX: 4.2, maxX: 11, minZ: -10, maxZ: -4.6 },
    spawnAnchorId: 'anchor-path-north-east',
  },
];

export const NPC_DEFINITIONS: readonly NpcDefinition[] = [
  {
    id: 'npc-elder',
    archetype: 'elder',
    anchorId: 'anchor-square',
    homeAreaId: 'area-town',
    dialogueIds: ['elder-intro'],
  },
  {
    id: 'npc-neighbour',
    archetype: 'neighbour',
    anchorId: 'anchor-home-gate',
    homeAreaId: 'area-home',
    dialogueIds: ['neighbour-intro'],
  },
  {
    id: 'npc-shopkeeper',
    archetype: 'shopkeeper',
    anchorId: 'anchor-shop',
    homeAreaId: 'area-market',
    dialogueIds: ['shopkeeper-intro'],
  },
  {
    id: 'npc-gardener',
    archetype: 'gardener',
    anchorId: 'anchor-garden',
    homeAreaId: 'area-garden',
    dialogueIds: ['gardener-intro'],
  },
  {
    id: 'npc-child-friend',
    archetype: 'friend',
    anchorId: 'anchor-friend',
    homeAreaId: 'area-town',
    dialogueIds: ['friend-idle'],
  },
  {
    id: 'npc-baker',
    archetype: 'baker',
    anchorId: 'anchor-bakery',
    homeAreaId: 'area-market',
    dialogueIds: ['baker-intro'],
  },
  {
    id: 'npc-teacher',
    archetype: 'teacher',
    anchorId: 'anchor-school',
    homeAreaId: 'area-school',
    dialogueIds: ['teacher-intro'],
  },
  {
    id: 'npc-child-ali',
    archetype: 'child',
    anchorId: 'anchor-school-yard',
    homeAreaId: 'area-school',
    dialogueIds: ['ali-intro'],
  },
  {
    id: 'npc-park-keeper',
    archetype: 'parkkeeper',
    anchorId: 'anchor-park',
    homeAreaId: 'area-park',
    dialogueIds: ['parkkeeper-intro'],
  },
  {
    id: 'npc-child-sara',
    archetype: 'child',
    anchorId: 'anchor-park-hill',
    homeAreaId: 'area-park',
    dialogueIds: ['sara-intro'],
  },
  {
    id: 'npc-fisher',
    archetype: 'fisher',
    anchorId: 'anchor-river',
    homeAreaId: 'area-river',
    // The fisher splits the day between the river and the bakery queue —
    // a deterministic two-spot schedule driven by world time.
    schedule: {
      spots: [
        { anchorId: 'anchor-river', activity: 'working' },
        // Queues beside the baker, not inside him.
        { anchorId: 'anchor-bakery', activity: 'waiting', offsetX: -0.7, offsetZ: 0.9 },
      ],
    },
    dialogueIds: ['fisher-intro'],
  },
];

const AREA_BY_ID = new Map<AreaId, WorldArea>(WORLD_AREAS.map((area) => [area.id, area]));
const NPC_BY_ID = new Map<NpcId, NpcDefinition>(NPC_DEFINITIONS.map((npc) => [npc.id, npc]));

export function getArea(id: AreaId): WorldArea {
  const area = AREA_BY_ID.get(id);
  if (!area) throw new Error(`Unknown area: ${id}`);
  return area;
}

export function getNpc(id: NpcId): NpcDefinition {
  const npc = NPC_BY_ID.get(id);
  if (!npc) throw new Error(`Unknown NPC: ${id}`);
  return npc;
}

export function getNpcOrNull(id: string): NpcDefinition | null {
  return NPC_BY_ID.get(id as NpcId) ?? null;
}

export function insideBounds(bounds: Bounds, x: number, z: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/** The area a world-space point falls inside; null when outside every area. */
export function areaAt(x: number, z: number): AreaId | null {
  for (const area of WORLD_AREAS) {
    if (insideBounds(area.bounds, x, z)) return area.id;
  }
  return null;
}

export function areaForAnchor(anchorId: AnchorId): AreaId {
  return getAnchor(anchorId).areaId;
}

export function npcsForArea(areaId: AreaId): readonly NpcDefinition[] {
  return NPC_DEFINITIONS.filter((npc) => npc.homeAreaId === areaId);
}

/**
 * Areas reachable in one waypoint hop: an edge whose ends live in different
 * areas is the portal between them.
 */
const ADJACENT_AREAS = (() => {
  const map = new Map<AreaId, Set<AreaId>>(WORLD_AREAS.map((area) => [area.id, new Set()]));
  for (const edge of EDGES) {
    const a = getAnchor(edge.from).areaId;
    const b = getAnchor(edge.to).areaId;
    if (a === b) continue;
    map.get(a)?.add(b);
    map.get(b)?.add(a);
  }
  return map;
})();

export function adjacentAreaIds(areaId: AreaId): readonly AreaId[] {
  return [...(ADJACENT_AREAS.get(areaId) ?? [])];
}

/**
 * Lightweight content activation: the active area plus the areas reachable in
 * one hop. Renderers should only do visual work for content inside
 * `visibleAreaIds`; data for every other NPC/area stays in memory but costs
 * nothing per frame.
 */
export function visibleAreaIds(activeAreaId: AreaId): readonly AreaId[] {
  return [activeAreaId, ...adjacentAreaIds(activeAreaId)];
}

/**
 * Where a scheduled NPC stands at `worldTime` — a pure function of a coarse
 * world clock (the caller's tick, e.g. area-visit count), not of the
 * player's location and not of elapsed frames. Idle NPCs (no schedule)
 * always stand at their home anchor. Area activation decides only whether
 * the resolved spot is mounted, never which spot is current.
 *
 * `resolveNpcSpot` returns the full authored spot (incl. stand offset, so a
 * visitor never shares a resident's exact position); `resolveNpcAnchor` is
 * the anchor-only convenience.
 */
export function resolveNpcSpot(npc: NpcDefinition, worldTime: number): NpcScheduleSpot | null {
  const spots = npc.schedule?.spots;
  if (!spots || spots.length === 0) return null;
  const tick = Math.max(0, Math.floor(worldTime));
  return spots[tick % spots.length] ?? null;
}

export function resolveNpcAnchor(npc: NpcDefinition, worldTime: number): AnchorId {
  return resolveNpcSpot(npc, worldTime)?.anchorId ?? npc.anchorId;
}

/** Stable activity label for an NPC's current spot (schedule-aware). */
export function resolveNpcActivity(npc: NpcDefinition, worldTime: number): NpcSimState {
  const anchorId = resolveNpcAnchor(npc, worldTime);
  const spot = npc.schedule?.spots.find((entry) => entry.anchorId === anchorId);
  return spot?.activity ?? 'at-home';
}

/** All world-space points the world occupies (camera fits and bounds checks). */
export const WORLD_BOUNDS: Bounds = WORLD_AREAS.reduce(
  (acc, area) => ({
    minX: Math.min(acc.minX, area.bounds.minX),
    maxX: Math.max(acc.maxX, area.bounds.maxX),
    minZ: Math.min(acc.minZ, area.bounds.minZ),
    maxZ: Math.max(acc.maxZ, area.bounds.maxZ),
  }),
  { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
);

// Referenced so ANCHORS stays a hard dependency of this registry — an anchor
// without an areaId is a compile error upstream, and a typo'd areaId fails in
// content validation.
void ANCHORS;
