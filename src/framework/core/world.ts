import type {
  AnchorId,
  AreaId,
  DiscoveryId,
  LandmarkId,
  MapId,
  NpcId,
  TransitionId,
} from './identifiers.ts';

/**
 * World-structure primitives: the reusable half of the world model — bounds,
 * waypoint graph nodes/edges, map transitions and placements. Application
 * labels (`labelFa`), NPC content (archetypes, schedules, dialogue) and
 * environment presentation stay in application types, which extend these.
 * Pure data — no React, Three.js or DOM.
 */

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * A waypoint in the data-defined navigation graph. Movement is restricted to
 * anchors, so the child can never walk into geometry and no physics engine is
 * needed. Every anchor declares its `areaId` and `mapId`: areas connect
 * through normal edges that cross area bounds; cross-map travel uses
 * transitions.
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
  readonly transitionId?: TransitionId | undefined;
}

/** An undirected walking edge between two anchors on the same map. */
export interface Edge {
  readonly from: AnchorId;
  readonly to: AnchorId;
  /**
   * World fact gating this edge: the edge only exists in the fact-filtered
   * world (`worldForDiscoveries`) once the discovery is recorded — the
   * mechanic behind "solved challenge → the bridge/path opens". Optional;
   * omitted means always passable.
   */
  readonly requiresDiscoveryId?: DiscoveryId;
}

/**
 * A logical region of the one shared world coordinate system. All world
 * content (anchors, NPCs, landmarks, decorations) belongs to exactly one area,
 * so the map can grow by adding areas instead of one giant coordinate file.
 */
export interface WorldArea {
  readonly id: AreaId;
  readonly bounds: Bounds;
  /** Anchor the avatar is placed at when spawning directly into this area. */
  readonly spawnAnchorId: AnchorId;
}

/**
 * A playable map/scene with its own local coordinate system and bounds.
 * Presentation (labels, environment) is an application concern — this is the
 * structural core the camera and navigation read.
 */
export interface WorldMap {
  readonly id: MapId;
  readonly bounds: Bounds;
  /** Anchor the avatar appears at when entering without a specific spawn. */
  readonly spawnAnchorId: AnchorId;
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
  readonly id: TransitionId;
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
 * The home/resident spot of one NPC, as authored world structure. Builder
 * documents carry placements rather than NPC definitions: archetype,
 * schedule and dialogue stay content-owned. A placement overrides the NPC's
 * `anchorId`/home location for preview; schedule spot anchors are unaffected.
 */
export interface NpcPlacement {
  readonly npcId: NpcId;
  readonly anchorId: AnchorId;
  readonly offsetX?: number;
  readonly offsetZ?: number;
}
