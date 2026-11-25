import type { ModelAssetLoader, ModelLease } from 'waypoint-rpg-three';

export interface LoadedModelLease {
  readonly assetId: string;
  readonly instanceId: string;
  readonly loader: ModelAssetLoader;
  readonly lease: ModelLease;
}

export interface ModelLeaseRequest {
  readonly assetId: string;
  readonly instanceId: string;
  readonly loader: ModelAssetLoader;
}

export function modelLeaseForRequest(
  loaded: LoadedModelLease | null,
  request: ModelLeaseRequest,
): ModelLease | null {
  if (
    !loaded ||
    loaded.assetId !== request.assetId ||
    loaded.instanceId !== request.instanceId ||
    loaded.loader !== request.loader
  )
    return null;
  return loaded.lease;
}
