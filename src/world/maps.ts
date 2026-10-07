import type { AnchorId } from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import type { MapId, MapTransition, WorldMapDefinition } from '../domain/world/types.ts';

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
    // Camera clamps its visible footprint inside these bounds minus
    // `cameraPadding` — the margin is wide enough that every interactive
    // anchor stays inside the guaranteed-visible rect (see visibility.test).
    bounds: { minX: -14.5, maxX: 15.5, minZ: -11.5, maxZ: 9.5 },
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
    bounds: { minX: -4.5, maxX: 4.5, minZ: -5, maxZ: 5 },
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
  {
    id: 'map-challenge',
    labelFa: 'سرزمین چالش',
    bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 7 },
    spawnAnchorId: 'anchor-challenge-entry',
    environment: {
      // Adventure-playground atmosphere: a warm, saturated late-day sky and
      // soft haze — dramatic contrast against town and cave without ever
      // going dark or frightening.
      clearColor: '#ffd9b0',
      fog: { color: '#f6cfa6', near: 18, far: 55 },
      skyDome: true,
      hemisphere: { sky: '#fff3dd', ground: '#c98f6b', intensity: 1.0 },
      directionals: [
        // Strong warm sun — the "big adventure" key light.
        { color: '#ffbe7a', position: [8, 9, 3], intensity: 1.0 },
        // Cool violet bounce for contrast.
        { color: '#b9a8f0', position: [-6, 7, -5], intensity: 0.4 },
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
  {
    // The deep tunnel at the back of the cave: first arrival reveals it,
    // later arrivals travel into the Challenge Zone.
    id: 'transition-cave-challenge',
    fromMap: 'map-cave',
    fromAnchor: 'anchor-cave-tunnel',
    toMap: 'map-challenge',
    toAnchor: 'anchor-challenge-entry',
    discoveryId: 'discovery-challenge-tunnel',
  },
  {
    // The way back: the challenge gate returns to the tunnel's cave-side
    // anchor, never a generic spawn.
    id: 'transition-challenge-exit',
    fromMap: 'map-challenge',
    fromAnchor: 'anchor-challenge-entry',
    toMap: 'map-cave',
    toAnchor: 'anchor-cave-tunnel',
  },
];

const MAP_BY_ID = new WeakMap<readonly WorldMapDefinition[], Map<MapId, WorldMapDefinition>>();

function mapsById(maps: readonly WorldMapDefinition[]): Map<MapId, WorldMapDefinition> {
  let byId = MAP_BY_ID.get(maps);
  if (!byId) {
    byId = new Map(maps.map((m) => [m.id, m]));
    MAP_BY_ID.set(maps, byId);
  }
  return byId;
}

export function getMap(source: WorldSource, id: MapId): WorldMapDefinition {
  const map = mapsById(source.maps).get(id);
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

/** The transition (if any) a player triggers by arriving at this anchor. */
export function transitionForAnchor(source: WorldSource, anchorId: AnchorId): MapTransition | null {
  const anchor = source.anchors.find((a) => a.id === anchorId);
  if (!anchor?.transitionId) return null;
  return source.transitions.find((t) => t.id === anchor.transitionId) ?? null;
}
