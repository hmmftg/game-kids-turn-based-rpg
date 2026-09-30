import type { AnchorId } from '../domain/game/types.ts';
import type { MapId, MapTransition, WorldMapDefinition } from '../domain/world/types.ts';
import { ANCHORS } from './navigation/graph.ts';

/**
 * Map registry: the playable scenes of the world. The outdoor neighbourhood
 * is the primary map; secondary maps (caves, interiors) are their own entries
 * with a local coordinate system, bounds, spawn and environment.
 *
 * Only the current map's scene mounts — transitions are deterministic data
 * (`MAP_TRANSITIONS`), not edges, so `findPath` can never wander across maps.
 *
 * Adding a map is a data task:
 * - a `WorldMapDefinition` here (id + bounds + spawn + environment)
 * - anchors tagged with its `mapId` in `navigation/graph.ts`
 * - `MapTransition` rows linking it to an existing map
 */
export const WORLD_MAPS: readonly WorldMapDefinition[] = [
  {
    id: 'map-town',
    labelFa: 'محله',
    bounds: { minX: -13.5, maxX: 13.5, minZ: -10, maxZ: 9.5 },
    spawnAnchorId: 'anchor-square',
    environment: {
      clearColor: '#cfe8ff',
      fog: { color: '#e3ede9', near: 26, far: 68 },
      skyDome: true,
      hemisphere: { sky: '#fdf6e8', ground: '#c8b78f', intensity: 1.0 },
      directionals: [
        { color: '#ffe3b8', position: [6, 10, 4], intensity: 0.9 },
        { color: '#bcd8f0', position: [-5, 8, -6], intensity: 0.25 },
      ],
    },
  },
  {
    id: 'map-cave',
    labelFa: 'غار',
    bounds: { minX: -4.5, maxX: 4.5, minZ: -4, maxZ: 5 },
    spawnAnchorId: 'anchor-cave-mouth',
    // Small interior: a tighter default zoom than the open neighbourhood.
    cameraZoom: 72,
    environment: {
      clearColor: '#241f2e',
      fog: { color: '#241f2e', near: 10, far: 30 },
      skyDome: false,
      hemisphere: { sky: '#6a5f88', ground: '#241f2e', intensity: 0.55 },
      directionals: [
        // Cool shaft of daylight falling in from the mouth.
        { color: '#bcd8f0', position: [0, 8, 5], intensity: 0.5 },
        // Warm bounce from inside — reads as the crystal's own glow.
        { color: '#ffd9a0', position: [2.5, 5, -2], intensity: 0.35 },
      ],
    },
  },
];

export const MAP_TRANSITIONS: readonly MapTransition[] = [
  {
    id: 'transition-cave-entrance',
    fromMap: 'map-town',
    fromAnchor: 'anchor-cave-entrance',
    toMap: 'map-cave',
    toAnchor: 'anchor-cave-mouth',
    discoveryId: 'discovery-cave-entrance',
  },
  {
    id: 'transition-cave-exit',
    fromMap: 'map-cave',
    fromAnchor: 'anchor-cave-mouth',
    toMap: 'map-town',
    toAnchor: 'anchor-cave-entrance',
  },
];

const MAP_BY_ID = new Map<MapId, WorldMapDefinition>(WORLD_MAPS.map((m) => [m.id, m]));

export function getMap(id: MapId): WorldMapDefinition {
  const map = MAP_BY_ID.get(id);
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

/** The transition (if any) a player triggers by arriving at this anchor. */
export function transitionForAnchor(anchorId: AnchorId): MapTransition | null {
  const anchor = ANCHORS.find((a) => a.id === anchorId);
  if (!anchor?.transitionId) return null;
  return MAP_TRANSITIONS.find((t) => t.id === anchor.transitionId) ?? null;
}
