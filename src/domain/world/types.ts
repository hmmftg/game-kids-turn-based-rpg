import type {
  Anchor as CoreAnchor,
  WorldArea as CoreWorldArea,
  WorldMap as CoreWorldMap,
} from '../../framework/index.ts';

/**
 * This game's world-structure types: the framework's generic world primitives
 * (`src/framework/core/world.ts`) extended with application content — Persian
 * labels, the environment presentation model, NPC archetypes/schedules and
 * dialogue references. Pure data — no React, Three.js or DOM.
 *
 * Generic primitives (identifiers, bounds, anchors, edges, areas, maps,
 * transitions, placements) live in the framework; they are re-exported here
 * so existing `domain/world/types.ts` imports keep working.
 */
export type {
  AnchorId,
  AreaId,
  Bounds,
  DiscoveryId,
  Edge,
  MapId,
  MapTransition,
  NpcPlacement,
} from '../../framework/index.ts';

import type { AnchorId, AreaId, MapId, NpcId } from '../../framework/index.ts';

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
 * This game's logical area: the framework `WorldArea` plus its authored
 * Persian label.
 */
export interface WorldArea extends CoreWorldArea {
  readonly labelFa: string;
}

/**
 * This game's map: the framework `WorldMap` plus its label and environment.
 * Adding a map is data — the renderer reads the environment generically.
 */
export interface WorldMapDefinition extends CoreWorldMap {
  readonly id: MapId;
  readonly labelFa: string;
  readonly environment: EnvironmentDefinition;
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

/** This game's anchor: the framework waypoint plus its authored label. */
export interface Anchor extends CoreAnchor {
  readonly labelFa: string;
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
