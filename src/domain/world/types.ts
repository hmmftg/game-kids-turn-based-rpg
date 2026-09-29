import type { AnchorId, NpcId } from '../game/types.ts';

/**
 * World-structure types: logical areas layered over the single world
 * coordinate system, data-driven NPCs, and coarse NPC simulation states.
 * Pure data — no React, Three.js or DOM.
 */

export type AreaId = `area-${string}`;

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
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
  | 'child';

/** Coarse schedule states — enough for routines, cheap enough for many NPCs. */
export type NpcSimState = 'at-home' | 'walking' | 'working' | 'talking' | 'waiting';

export interface NpcScheduleSpot {
  readonly anchorId: AnchorId;
  readonly activity: NpcSimState;
}

export interface NpcSchedule {
  /**
   * Ordered standpoints the NPC cycles through. Resolution is *area
   * activation*, not a clock: when the child enters the area a spot belongs
   * to, the NPC is found there — a deterministic event-driven transition,
   * never a per-frame simulation.
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
