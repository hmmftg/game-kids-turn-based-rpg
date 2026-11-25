import { describe, expect, it } from 'vitest';
import { fitModelToGround, gardenMeshyModels } from '../src/scenes/mesh-presentation.js';

describe('Garden Meshy model presentation', () => {
  it('assigns each pilot asset one presentation role and visual scale', () => {
    expect(Object.keys(gardenMeshyModels).sort()).toEqual(
      ['fountain', 'guardian', 'blossomTree', 'shrine', 'sage'].sort(),
    );

    const ids = Object.values(gardenMeshyModels).map((model) => model.assetId);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toContain('meshy-garden-fountain');
    expect(ids).toContain('meshy-garden-guardian');
    expect(ids).toContain('meshy-garden-blossom-tree');
    expect(ids).toContain('meshy-garden-shrine');
    expect(ids).toContain('meshy-garden-sage');
  });

  it('fits object-level scale and ground offset without changing geometry', () => {
    expect(fitModelToGround({ min: [-1, -2, -3], max: [1, 2, 3] }, 2)).toEqual({
      scale: 0.5,
      groundOffset: 1,
    });
  });

  it('rejects degenerate or invalid bounds so callers can retain the fallback', () => {
    expect(fitModelToGround({ min: [0, 1, 0], max: [1, 1, 1] }, 2)).toBeNull();
    expect(fitModelToGround({ min: [0, 0, 0], max: [1, 1, 1] }, 0)).toBeNull();
  });
});
