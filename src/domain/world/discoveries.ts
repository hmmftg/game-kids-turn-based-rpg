import type { DiscoveryId } from './types.ts';

/**
 * The canonical registry of persistent world facts. A `DiscoveryId` is the
 * only "world remembers" primitive: transition reveals (`discoveryId` on a
 * `MapTransition`), battle victories (`victoryDiscoveryId` on a
 * `BattleDefinition`) and gated edges (`requiresDiscoveryId` on an `Edge`)
 * all validate against this set — an authored reference to an id not listed
 * here is a content error, never a runtime lookup.
 */
export const DISCOVERY_IDS = [
  'discovery-cave-entrance',
  'discovery-challenge-tunnel',
  'discovery-challenge-bird',
  'discovery-challenge-eagle',
  'discovery-challenge-butterfly',
] as const satisfies readonly DiscoveryId[];

const KNOWN_DISCOVERIES: ReadonlySet<string> = new Set(DISCOVERY_IDS);

export function isKnownDiscovery(id: string): id is DiscoveryId {
  return KNOWN_DISCOVERIES.has(id);
}
