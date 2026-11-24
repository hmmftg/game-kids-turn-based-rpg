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
} from 'waypoint-rpg-core';

const areaId = 'area-main' as AreaId;
const mapId = 'map-main' as MapId;
const anchorId = 'anchor-spawn' as AnchorId;
const bounds: Bounds = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };

export const spawnAnchor: Anchor = {
  id: anchorId,
  x: 0,
  z: 0,
  walkable: true,
  areaId,
  mapId,
  npcId: null,
  landmarkId: 'landmark-scene-center' as LandmarkId,
};

export const area: WorldArea = { id: areaId, bounds, spawnAnchorId: anchorId };
export const map: WorldMap = { id: mapId, bounds, spawnAnchorId: anchorId };
export const worldSource: GraphSource = { anchors: [spawnAnchor], edges: [] };
