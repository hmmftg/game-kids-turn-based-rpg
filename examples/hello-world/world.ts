import type {
  Anchor,
  AnchorId,
  AreaId,
  Bounds,
  GraphSource,
  LandmarkId,
  MapId,
  WorldArea,
  WorldMap,
} from '../../src/framework/index.ts';

/**
 * The smallest world a consumer can declare: one map, one area, one walkable
 * anchor with a landmark prop standing on it. ~30 lines of data — the
 * framework's world primitives are pure structure, no renderer.
 */
const areaId: AreaId = 'area-garden' as AreaId;
const mapId: MapId = 'map-garden' as MapId;

const bounds: Bounds = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };

const fountainAnchor: Anchor = {
  id: 'anchor-fountain' as AnchorId,
  x: 0,
  z: 0,
  walkable: true,
  areaId,
  mapId,
  npcId: null,
  landmarkId: 'landmark-fountain' as LandmarkId,
};

export const area: WorldArea = { id: areaId, bounds, spawnAnchorId: fountainAnchor.id };

export const map: WorldMap = { id: mapId, bounds, spawnAnchorId: fountainAnchor.id };

export const worldSource: GraphSource = { anchors: [fountainAnchor], edges: [] };

export const PROP_ANCHOR = fountainAnchor;
