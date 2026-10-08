import type { AnchorId, LandmarkId, NpcId } from '../game/types.ts';

/**
 * World-structure types: logical areas layered over the single world
 * coordinate system, data-driven NPCs, and coarse NPC simulation states.
 * Pure data — no React, Three.js or DOM.
 */

export type AreaId = `area-${string}`;

/**
 * A playable map/scene with its own local coordinate system, bounds, anchors
 * and environment. The outdoor neighbourhood is `map-town`; secondary maps
 * (interiors, hidden places) are their own entries — never another area on
 * the town plane.
 */
export type MapId = `map-${string}`;

/** A persistent world fact the child can find — e.g. a hidden entrance. */
export type DiscoveryId = `discovery-${string}`;

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Data-driven environment for one map — presentation data, no components. */
export interface EnvironmentDefinition {
  /** Renderer clear colour (skydome maps still need a base). */
  readonly clearColor: string;
  /** Distance fog; null = no fog. */
  readonly fog: { readonly color: string; readonly near: number; readonly far: number } | null;
  /** Whether the sky dome backdrop mounts (interiors use a closed look). */
  readonly skyDome: boolean;
  readonly hemisphere: {
    readonly sky: string;
    readonly ground: string;
    readonly intensity: number;
  };
  readonly directionals: readonly {
    readonly color: string;
    readonly position: readonly [number, number, number];
    readonly intensity: number;
  }[];
}

/**
 * One map: local bounds, its spawn anchor and how it looks. Adding a map is
 * data — the renderer reads the environment generically.
 */
export interface WorldMapDefinition {
  readonly id: MapId;
  readonly labelFa: string;
  readonly bounds: Bounds;
  /** Anchor the avatar appears at when entering without a specific spawn. */
  readonly spawnAnchorId: AnchorId;
  readonly environment: EnvironmentDefinition;
  /**
   * Optional presentation tweaks for the shared follow-camera: a tighter
   * default zoom (e.g. an intimate interior) or wider clamp padding. The
   * camera logic itself is never per-map.
   */
  readonly cameraZoom?: number;
  readonly cameraPadding?: number;
}

/**
 * A deterministic door between two maps. `fromAnchor` is where the player
 * triggers it (walk-to + tap), `toAnchor` is where they appear on the other
 * side — an exit always returns to the exact outdoor entrance, never to a
 * generic spawn.
 */
export interface MapTransition {
  readonly id: `transition-${string}`;
  readonly fromMap: MapId;
  readonly fromAnchor: AnchorId;
  readonly toMap: MapId;
  readonly toAnchor: AnchorId;
  /**
   * World fact gating this transition: the first arrival at `fromAnchor`
   * reveals the entrance (records the discovery); later arrivals travel.
   * Transitions without one are always passable.
   */
  readonly discoveryId?: DiscoveryId | undefined;
}

/**
 * A logical region of the one shared world coordinate system. All world
 * content (anchors, NPCs, landmarks, decorations) belongs to exactly one area,
 * so the map can grow by adding areas instead of one giant coordinate file.
 */
export interface WorldArea {
  readonly id: AreaId;
  readonly labelFa: string;
  readonly bounds: Bounds;
  /** Anchor the avatar is placed at when spawning directly into this area. */
  readonly spawnAnchorId: AnchorId;
}

/** Visual/behavioural family — never a unique model per NPC. */
export type NpcArchetype =
  | 'elder'
  | 'neighbour'
  | 'shopkeeper'
  | 'gardener'
  | 'friend'
  | 'baker'
  | 'teacher'
  | 'fisher'
  | 'parkkeeper'
  | 'critter'
  | 'child';

/**
 * A waypoint in the data-defined navigation graph. Movement is restricted to
 * anchors, so the child can never walk into geometry and no physics engine is
 * needed. Every anchor declares its `areaId` and `mapId`: areas connect through
 * normal edges that cross area bounds; cross-map travel uses transitions.
 */
export interface Anchor {
  readonly id: AnchorId;
  /** World position on the ground plane (metres). */
  readonly x: number;
  readonly z: number;
  readonly walkable: boolean;
  /** The world area this anchor belongs to — world content owns an area. */
  readonly areaId: AreaId;
  /** The map this anchor lives on; cross-map travel uses transitions, not edges. */
  readonly mapId: MapId;
  /** Interaction the anchor stands in front of, if any. */
  readonly npcId: NpcId | null;
  readonly landmarkId: LandmarkId | null;
  /** Map transition triggered by arriving here (doors, hidden entrances). */
  readonly transitionId?: `transition-${string}` | undefined;
  readonly labelFa: string;
}

/** An undirected walking edge between two anchors on the same map. */
export interface Edge {
  readonly from: AnchorId;
  readonly to: AnchorId;
  /**
   * World fact gating this edge: the edge only exists in the fact-filtered
   * world (`worldForDiscoveries`) once the discovery is recorded — the
   * mechanic behind "solved challenge → the bridge/path opens". Optional;
   * omitted means always passable. Must reference `DISCOVERY_IDS`.
   */
  readonly requiresDiscoveryId?: DiscoveryId;
}

/**
 * The home/resident spot of one NPC, as authored world structure. Builder
 * documents carry placements rather than `NpcDefinition`s: archetype,
 * schedule and dialogue stay content-owned. A placement overrides the NPC's
 * `anchorId`/home location for preview; schedule spot anchors are unaffected.
 */
export interface NpcPlacement {
  readonly npcId: NpcId;
  readonly anchorId: AnchorId;
  readonly offsetX?: number;
  readonly offsetZ?: number;
}

/** Coarse schedule states — enough for routines, cheap enough for many NPCs. */
export type NpcSimState = 'at-home' | 'walking' | 'working' | 'talking' | 'waiting';

/** A small activity prop rendered beside the NPC while at this spot. */
export type NpcRoutineProp = 'basket' | 'crate' | 'planter' | 'ball';

export interface NpcScheduleSpot {
  readonly anchorId: AnchorId;
  readonly activity: NpcSimState;
  /**
   * Optional stand offset from the anchor's usual NPC standpoint, so a
   * visitor never shares the exact spot of the anchor's resident NPC.
   */
  readonly offsetX?: number;
  readonly offsetZ?: number;
  /**
   * Authored facing (radians) used while the player is far; nearby the NPC
   * still turns to watch the child approach.
   */
  readonly facing?: number;
  /** Activity prop shown beside the figure at this spot. */
  readonly prop?: NpcRoutineProp;
  /** Where the prop sits relative to the figure (world units). */
  readonly propOffsetX?: number;
  readonly propOffsetZ?: number;
  /**
   * Contextual dialogue entry while at this spot — talking to the NPC here
   * opens this node instead of their default `dialogueIds[0]`. Must reference
   * a dialogue node owned by this NPC (content-validated).
   */
  readonly dialogueId?: string;
}

export interface NpcSchedule {
  /**
   * Ordered standpoints the NPC cycles through as world time passes. The
   * current spot is a pure function of `worldTime` (a coarse world clock —
   * e.g. the count of area visits), never of where the player happens to
   * be, and never a per-frame simulation: `resolveNpcAnchor(npc, worldTime)`
   * returns `spots[worldTime % spots.length]`.
   */
  readonly spots: readonly NpcScheduleSpot[];
}

/**
 * Everything needed to add an NPC is data. Identity lives here; looks
 * (palette/hair/accessory) live in `world/npcLooks.ts`; copy lives in
 * `content/fa`. Position is referenced by anchor so NPCs share the single
 * world coordinate system and the waypoint graph.
 */
export interface NpcDefinition {
  readonly id: NpcId;
  readonly archetype: NpcArchetype;
  /** Home standpoint; also the interaction anchor (tap → dialogue). */
  readonly anchorId: AnchorId;
  readonly homeAreaId: AreaId;
  readonly schedule?: NpcSchedule;
  /** Entry dialogue nodes, first = default greeting/quest offer. */
  readonly dialogueIds: readonly string[];
}
