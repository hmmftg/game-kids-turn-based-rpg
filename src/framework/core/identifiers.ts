/**
 * Generic world identifiers — template-literal string brands shared by every
 * consumer of the framework. These are deliberately content-free: nothing
 * here knows this game's anchors, NPCs, or maps.
 */

export type AnchorId = `anchor-${string}`;
export type LandmarkId = `landmark-${string}`;
export type NpcId = `npc-${string}`;
export type MapId = `map-${string}`;
export type DiscoveryId = `discovery-${string}`;
export type AreaId = `area-${string}`;
export type TransitionId = `transition-${string}`;
