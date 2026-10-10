import type { AnchorId, NpcId } from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import type {
  AreaId,
  Bounds,
  NpcDefinition,
  NpcPlacement,
  NpcScheduleSpot,
  NpcSimState,
  WorldArea,
} from '../domain/world/types.ts';
import { ANCHORS, EDGES, getAnchor, getAnchorOrNull } from './navigation/graph.ts';
import { NPC_STAND_OFFSET } from './placement.ts';
import { insideBounds } from '../domain/world/geometry.ts';

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
  // The cave's only area — its anchors live on map-cave, so it is never a
  // visible/adjacent area of the outdoor world and stays fully inactive there.
  {
    id: 'area-cave',
    labelFa: 'غار',
    bounds: { minX: -4, maxX: 4, minZ: -3.5, maxZ: 4.5 },
    spawnAnchorId: 'anchor-cave-mouth',
  },
  // The Challenge Zone's three areas — all on map-challenge, so like the
  // cave they never count as visible/adjacent on the outdoor maps.
  {
    id: 'area-challenge-entry',
    labelFa: 'دروازه‌ی چالش',
    bounds: { minX: -3, maxX: 3, minZ: 3, maxZ: 6 },
    spawnAnchorId: 'anchor-challenge-entry',
  },
  {
    id: 'area-challenge-field',
    labelFa: 'دشت چالش',
    bounds: { minX: -4.5, maxX: 4.5, minZ: -4, maxZ: 3 },
    spawnAnchorId: 'anchor-challenge-path-1',
  },
  {
    id: 'area-challenge-depths',
    labelFa: 'اعماق چالش',
    bounds: { minX: -3, maxX: 3, minZ: -7, maxZ: -4 },
    spawnAnchorId: 'anchor-challenge-depths',
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
    // Class, then the yard with the children, then the square for errands —
    // all inside the school area so her quest stays beside her.
    schedule: {
      spots: [
        { anchorId: 'anchor-school', activity: 'working', dialogueId: 'teacher-at-class' },
        { anchorId: 'anchor-school-yard', activity: 'talking', dialogueId: 'teacher-at-yard' },
        {
          anchorId: 'anchor-school',
          activity: 'at-home',
          facing: Math.PI,
          dialogueId: 'teacher-at-square',
        },
      ],
    },
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
    // Tends the park, checks on the hill, rests by the cave-side flowerbeds.
    schedule: {
      spots: [
        {
          anchorId: 'anchor-park',
          activity: 'working',
          prop: 'planter',
          propOffsetX: 0.9,
          propOffsetZ: 0.4,
          dialogueId: 'keeper-at-park',
        },
        { anchorId: 'anchor-park-hill', activity: 'talking', dialogueId: 'keeper-at-hill' },
        {
          anchorId: 'anchor-park',
          activity: 'at-home',
          facing: Math.PI / 2,
          dialogueId: 'keeper-at-rest',
        },
      ],
    },
    dialogueIds: ['parkkeeper-intro'],
  },
  {
    id: 'npc-child-sara',
    archetype: 'child',
    anchorId: 'anchor-park-hill',
    homeAreaId: 'area-park',
    // Plays on the hill, drifts down to the park gate, comes back with her ball.
    schedule: {
      spots: [
        {
          anchorId: 'anchor-park-hill',
          activity: 'at-home',
          prop: 'ball',
          propOffsetX: 0.8,
          propOffsetZ: 0.5,
          dialogueId: 'sara-on-hill',
        },
        {
          anchorId: 'anchor-park',
          activity: 'waiting',
          offsetX: -0.6,
          offsetZ: 0.8,
          dialogueId: 'sara-at-gate',
        },
        {
          anchorId: 'anchor-park-hill',
          activity: 'talking',
          prop: 'ball',
          propOffsetX: -0.7,
          propOffsetZ: 0.6,
          dialogueId: 'sara-on-hill',
        },
      ],
    },
    dialogueIds: ['sara-intro'],
  },
  {
    id: 'npc-fisher',
    archetype: 'fisher',
    anchorId: 'anchor-river',
    homeAreaId: 'area-river',
    // The fisher's day: fish the river, queue at the bakery, rest on the
    // bank — a deterministic routine driven by world time (the reference
    // implementation other routines copy).
    schedule: {
      spots: [
        {
          anchorId: 'anchor-river',
          activity: 'working',
          facing: -Math.PI / 2,
          prop: 'basket',
          propOffsetX: 0.8,
          propOffsetZ: -0.5,
          dialogueId: 'fisher-at-river',
        },
        // Queues beside the baker, not inside him.
        {
          anchorId: 'anchor-bakery',
          activity: 'waiting',
          offsetX: -0.7,
          offsetZ: 0.9,
          dialogueId: 'fisher-at-bakery',
        },
        {
          anchorId: 'anchor-river-bank',
          activity: 'at-home',
          facing: Math.PI / 2,
          dialogueId: 'fisher-at-bank',
        },
      ],
    },
    dialogueIds: ['fisher-intro'],
  },
  {
    id: 'npc-cave-mouse',
    archetype: 'critter',
    anchorId: 'anchor-cave-mouse',
    homeAreaId: 'area-cave',
    dialogueIds: ['cavemouse-intro'],
  },
  {
    // The playful mouse is the micro-battle opponent — now a Challenge Zone
    // resident (it wandered off from the fountain): a tap on its figure
    // starts the unchanged `battle-playful-mouse` activity. It wanders a
    // tiny radius between its spot and its den.
    id: 'npc-playful-mouse',
    archetype: 'critter',
    anchorId: 'anchor-challenge-mouse',
    homeAreaId: 'area-challenge-field',
    schedule: {
      spots: [
        { anchorId: 'anchor-challenge-mouse', activity: 'at-home' },
        { anchorId: 'anchor-challenge-mouse-den', activity: 'at-home' },
      ],
    },
    dialogueIds: ['playfulmouse-intro'],
  },
  {
    // Challenge opponent: the bird changes perch as world time passes.
    id: 'npc-challenge-bird',
    archetype: 'critter',
    anchorId: 'anchor-challenge-bird',
    homeAreaId: 'area-challenge-field',
    schedule: {
      spots: [
        { anchorId: 'anchor-challenge-bird', activity: 'at-home' },
        { anchorId: 'anchor-challenge-bird-perch', activity: 'waiting' },
      ],
    },
    dialogueIds: ['challengebird-intro'],
  },
  {
    // Challenge opponent: the proud eagle sits and watches the child
    // approach — one authored facing spot, proximity-facing does the rest.
    id: 'npc-challenge-eagle',
    archetype: 'critter',
    anchorId: 'anchor-challenge-eagle',
    homeAreaId: 'area-challenge-field',
    schedule: {
      spots: [
        {
          anchorId: 'anchor-challenge-eagle',
          activity: 'waiting',
          // Faces the path spine (path-2) from its perch.
          facing: Math.atan2(3.2, 1.6),
        },
      ],
    },
    dialogueIds: ['challengeeagle-intro'],
  },
  {
    // Challenge opponent: the gentlest one — drifts between the meadow spot
    // and the flower.
    id: 'npc-challenge-butterfly',
    archetype: 'critter',
    anchorId: 'anchor-challenge-butterfly',
    homeAreaId: 'area-challenge-field',
    schedule: {
      spots: [
        { anchorId: 'anchor-challenge-butterfly', activity: 'at-home' },
        { anchorId: 'anchor-challenge-flower', activity: 'at-home' },
      ],
    },
    dialogueIds: ['challengebutterfly-intro'],
  },
];

// Id lookups are source-parameterized: the same resolvers serve the shipped
// registries (STATIC_WORLD_SOURCE) and a builder DocumentWorldSource.
// Derived maps are memoized per table identity so the static path stays free.
const AREA_BY_ID = new WeakMap<readonly WorldArea[], Map<AreaId, WorldArea>>();
const NPC_BY_ID = new WeakMap<readonly NpcDefinition[], Map<NpcId, NpcDefinition>>();

function areasById(areas: readonly WorldArea[]): Map<AreaId, WorldArea> {
  let byId = AREA_BY_ID.get(areas);
  if (!byId) {
    byId = new Map(areas.map((area) => [area.id, area]));
    AREA_BY_ID.set(areas, byId);
  }
  return byId;
}

function npcsById(npcs: readonly NpcDefinition[]): Map<NpcId, NpcDefinition> {
  let byId = NPC_BY_ID.get(npcs);
  if (!byId) {
    byId = new Map(npcs.map((npc) => [npc.id, npc]));
    NPC_BY_ID.set(npcs, byId);
  }
  return byId;
}

export function getArea(source: WorldSource, id: AreaId): WorldArea {
  const area = areasById(source.areas).get(id);
  if (!area) throw new Error(`Unknown area: ${id}`);
  return area;
}

export function getNpc(source: WorldSource, id: NpcId): NpcDefinition {
  const npc = npcsById(source.npcDefinitions).get(id);
  if (!npc) throw new Error(`Unknown NPC: ${id}`);
  return npc;
}

export function getNpcOrNull(source: WorldSource, id: string): NpcDefinition | null {
  return npcsById(source.npcDefinitions).get(id as NpcId) ?? null;
}

export { insideBounds };

/** The area a world-space point falls inside; null when outside every area. */
export function areaAt(source: WorldSource, x: number, z: number): AreaId | null {
  for (const area of source.areas) {
    if (insideBounds(area.bounds, x, z)) return area.id;
  }
  return null;
}

export function areaForAnchor(source: WorldSource, anchorId: AnchorId): AreaId {
  return getAnchor(source, anchorId).areaId;
}

export function npcsForArea(source: WorldSource, areaId: AreaId): readonly NpcDefinition[] {
  return source.npcDefinitions.filter((npc) => npc.homeAreaId === areaId);
}

/**
 * Areas reachable in one waypoint hop: an edge whose ends live in different
 * areas is the portal between them.
 */
const ADJACENT_AREAS = new WeakMap<readonly WorldArea[], Map<AreaId, Set<AreaId>>>();

function adjacentAreas(source: WorldSource): Map<AreaId, Set<AreaId>> {
  let map = ADJACENT_AREAS.get(source.areas);
  if (!map) {
    map = new Map(source.areas.map((area) => [area.id, new Set()]));
    for (const edge of source.edges) {
      const a = getAnchor(source, edge.from).areaId;
      const b = getAnchor(source, edge.to).areaId;
      if (a === b) continue;
      map.get(a)?.add(b);
      map.get(b)?.add(a);
    }
    ADJACENT_AREAS.set(source.areas, map);
  }
  return map;
}

export function adjacentAreaIds(source: WorldSource, areaId: AreaId): readonly AreaId[] {
  return [...(adjacentAreas(source).get(areaId) ?? [])];
}

/**
 * Lightweight content activation: the active area plus the areas reachable in
 * one hop. Renderers should only do visual work for content inside
 * `visibleAreaIds`; data for every other NPC/area stays in memory but costs
 * nothing per frame.
 */
export function visibleAreaIds(source: WorldSource, activeAreaId: AreaId): readonly AreaId[] {
  return [activeAreaId, ...adjacentAreaIds(source, activeAreaId)];
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

/** The NPC's home placement in this source (null when it has none). */
export function npcHomePlacement(source: WorldSource, npcId: NpcId): NpcPlacement | null {
  return source.npcPlacements.find((placement) => placement.npcId === npcId) ?? null;
}

/**
 * Where the NPC stands: schedule spot when it has one (schedule wins),
 * otherwise its home placement in this source — a builder-edited placement
 * relocates an unscheduled NPC everywhere this resolves. Spot offsets apply
 * on schedule spots; placement offsets apply at home.
 */
export function resolveNpcStand(
  source: WorldSource,
  npc: NpcDefinition,
  worldTime: number,
): { anchorId: AnchorId; offsetX: number; offsetZ: number; spot: NpcScheduleSpot | null } {
  const spot = resolveNpcSpot(npc, worldTime);
  if (spot) {
    return {
      anchorId: spot.anchorId,
      offsetX: spot.offsetX ?? 0,
      offsetZ: spot.offsetZ ?? 0,
      spot,
    };
  }
  const home = npcHomePlacement(source, npc.id);
  return {
    anchorId: home?.anchorId ?? npc.anchorId,
    offsetX: home?.offsetX ?? 0,
    offsetZ: home?.offsetZ ?? 0,
    spot: null,
  };
}

export function resolveNpcAnchor(
  source: WorldSource,
  npc: NpcDefinition,
  worldTime: number,
): AnchorId {
  return resolveNpcStand(source, npc, worldTime).anchorId;
}

/**
 * Small deterministic stand offset per NPC. Two people resolving to the
 * same anchor with no authored spot offset would otherwise occupy the
 * exact same point — one figure inside the other's tap cylinder, and the
 * front one unreachable. A stable ring slot (by registry order) keeps
 * every co-located pair distinct; callers add it on top of the authored
 * spot offset so both probes and rendering agree.
 */
export function npcFigureJitter(
  source: WorldSource,
  npcId: string,
): { readonly x: number; readonly z: number } {
  const index = source.npcDefinitions.findIndex((npc) => npc.id === npcId);
  const angle = ((index < 0 ? 0 : index) / 8) * Math.PI * 2;
  return { x: Math.cos(angle) * 0.7, z: Math.sin(angle) * 0.7 };
}

/**
 * Where the NPC's figure actually stands at `worldTime`: the resolved stand
 * anchor plus `NPC_STAND_OFFSET`, the spot/placement offset, and the
 * deterministic jitter — the one spatial truth the renderer draws, probes
 * report, and the camera frames. `null` when the anchor cannot resolve.
 */
export function npcFigurePosition(
  source: WorldSource,
  npc: NpcDefinition,
  worldTime: number,
): { readonly x: number; readonly z: number } | null {
  const stand = resolveNpcStand(source, npc, worldTime);
  const anchor = getAnchorOrNull(source, stand.anchorId);
  if (anchor === null) return null;
  const jitter = npcFigureJitter(source, npc.id);
  return {
    x: anchor.x + NPC_STAND_OFFSET.x + stand.offsetX + jitter.x,
    z: anchor.z + NPC_STAND_OFFSET.z + stand.offsetZ + jitter.z,
  };
}

/** Stable activity label for an NPC's current spot (schedule-aware). */
export function resolveNpcActivity(npc: NpcDefinition, worldTime: number): NpcSimState {
  return resolveNpcSpot(npc, worldTime)?.activity ?? 'at-home';
}

/** Every NPC physically standing at `anchorId` at `worldTime`. */
export function npcsAtAnchor(
  source: WorldSource,
  anchorId: AnchorId,
  worldTime: number,
): readonly NpcDefinition[] {
  return source.npcDefinitions.filter(
    (npc) => resolveNpcAnchor(source, npc, worldTime) === anchorId,
  );
}

/**
 * The NPC presence at an anchor: the resident while they are standing there,
 * otherwise a scheduled visitor. Anchors with nobody standing return null —
 * an empty spot is a real part of a routine, so nothing answers there.
 */
export function npcStandingAt(
  source: WorldSource,
  anchorId: AnchorId,
  worldTime: number,
): NpcDefinition | null {
  const present = npcsAtAnchor(source, anchorId, worldTime);
  if (present.length === 0) return null;
  const resident = getAnchorOrNull(source, anchorId)?.npcId ?? null;
  return present.find((npc) => npc.id === resident) ?? present[0] ?? null;
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
void EDGES;
