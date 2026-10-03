import type { WorldSource } from '../domain/world/source.ts';
import { ANCHORS, EDGES } from './navigation/graph.ts';
import { MAP_TRANSITIONS, WORLD_MAPS } from './maps.ts';
import { NPC_DEFINITIONS, WORLD_AREAS } from './registry.ts';

/**
 * The shipped world as a `WorldSource`: today's module constants plus home
 * placements derived from `NPC_DEFINITIONS` (same derivation the builder's
 * `fromRuntime` uses). Gameplay code threads this object through
 * source-parameterized helpers; the World Builder swaps in a
 * `DocumentWorldSource` compiled from its edited document instead.
 */
export const STATIC_WORLD_SOURCE: WorldSource = {
  maps: WORLD_MAPS,
  areas: WORLD_AREAS,
  anchors: ANCHORS,
  edges: EDGES,
  transitions: MAP_TRANSITIONS,
  npcDefinitions: NPC_DEFINITIONS,
  npcPlacements: NPC_DEFINITIONS.map((npc) => ({
    npcId: npc.id,
    anchorId: npc.anchorId,
  })),
};
