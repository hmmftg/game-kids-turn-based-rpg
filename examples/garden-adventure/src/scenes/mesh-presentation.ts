export const gardenMeshyModels = {
  fountain: {
    assetId: 'meshy-garden-fountain',
    targetHeight: 1.35,
    color: '#c4a77b',
  },
  guardian: {
    assetId: 'meshy-garden-guardian',
    targetHeight: 1.85,
    color: '#b49a57',
  },
  blossomTree: {
    assetId: 'meshy-garden-blossom-tree',
    targetHeight: 2.8,
    color: '#cf85a4',
  },
  shrine: {
    assetId: 'meshy-garden-shrine',
    targetHeight: 1.9,
    color: '#d5a2ad',
  },
  sage: {
    assetId: 'meshy-garden-sage',
    targetHeight: 2.1,
    color: '#bcb99c',
  },
} as const;

export interface ModelBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ModelGroundFit {
  readonly scale: number;
  readonly groundOffset: number;
}

export function fitModelToGround(bounds: ModelBounds, targetHeight: number): ModelGroundFit | null {
  const height = bounds.max[1] - bounds.min[1];
  if (
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(targetHeight) ||
    targetHeight <= 0
  )
    return null;

  const scale = targetHeight / height;
  return { scale, groundOffset: -bounds.min[1] * scale };
}
