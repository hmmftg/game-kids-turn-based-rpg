import type { WorldSource } from '../domain/world/source.ts';
import type { DiscoveryId } from '../domain/world/types.ts';
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

/**
 * The world as the child can walk it right now: the same source minus every
 * `requiresDiscoveryId` edge whose fact is not yet recorded.
 *
 * Invariant: only `edges` changes — `maps`, `areas`, `anchors`,
 * `transitions`, `npcDefinitions` and `npcPlacements` pass through by
 * reference, so `transitionForAnchor`, anchor lookups and all other
 * resolvers keep working against the same tables. An anchor behind a gated
 * edge stays `walkable` (a ground tap may resolve to it and find no path);
 * the scene shows the closed path physically. The full unfiltered graph is
 * what validation and the World Builder see.
 */
export function worldForDiscoveries(
  source: WorldSource,
  discoveries: readonly DiscoveryId[],
): WorldSource {
  if (!source.edges.some((edge) => edge.requiresDiscoveryId !== undefined)) return source;
  const edges = source.edges.filter(
    (edge) =>
      edge.requiresDiscoveryId === undefined || discoveries.includes(edge.requiresDiscoveryId),
  );
  if (edges.length === source.edges.length) return source;
  return { ...source, edges };
}
