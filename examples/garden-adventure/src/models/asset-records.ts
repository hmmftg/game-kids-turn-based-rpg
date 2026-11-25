import records from '../../assets/asset-records.json';
import type { ModelAssetRecord, ModelRuntimePolicy } from 'waypoint-rpg-three';

/** Game-owned, integrity-pinned models. Missing or rejected files use the scene geometry. */
export const gardenModelRecords = records as unknown as readonly ModelAssetRecord[];

/** Smaller limits for the two bundled reference fixtures; private pilot limits stay separate. */
export const GARDEN_MODEL_RUNTIME_POLICY: Readonly<ModelRuntimePolicy> = Object.freeze({
  maxTrianglesPerAsset: 8_000,
  maxLoadedAssets: 4,
  maxDecodedGeometryBytes: 4 * 1024 * 1024,
  maxSceneTriangles: 16_000,
  allowUnapproved: false,
});

export const GARDEN_MODEL_IDS = Object.freeze({
  animatedCharacter: 'phase5-animated-guardian',
  lanternBase: 'phase5-textured-static',
});
