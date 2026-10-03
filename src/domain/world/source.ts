import type {
  Anchor,
  Edge,
  MapTransition,
  NpcDefinition,
  NpcPlacement,
  WorldArea,
  WorldMapDefinition,
} from './types.ts';

/**
 * A single source of world data for the renderer and world-resolution helpers.
 *
 * The game consumes `StaticWorldSource` (today's module constants); the World
 * Builder preview consumes a `DocumentWorldSource` produced by
 * `WorldBuilderDocument.toRuntime()` — the same pipeline, no second renderer.
 *
 * `npcDefinitions` rides along because the renderer reads archetype, schedule
 * and dialogueIds directly: placements only describe *where* an NPC lives,
 * never *what* it is.
 */
export interface WorldSource {
  readonly maps: readonly WorldMapDefinition[];
  readonly areas: readonly WorldArea[];
  readonly anchors: readonly Anchor[];
  readonly edges: readonly Edge[];
  readonly transitions: readonly MapTransition[];
  readonly npcDefinitions: readonly NpcDefinition[];
  readonly npcPlacements: readonly NpcPlacement[];
}
