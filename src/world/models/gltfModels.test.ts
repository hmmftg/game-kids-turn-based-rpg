import { describe, expect, it } from 'vitest';
import type { QualityTier } from '../../domain/game/types.ts';
import { CUBIC_MODELS } from './cubicModels.ts';
import { LANDMARK_MAX_DETAIL_Z } from './cubic.tsx';
import { GLTF_MODELS, modelsForTier } from './gltfModels.tsx';
import {
  FOUNTAIN_BOUNDS,
  FOUNTAIN_FIT,
  fitLandmark,
  HOME_GATE_BOUNDS,
  HOME_GATE_FIT,
  SHOP_BOUNDS,
  SHOP_FIT,
} from './gltf/placement.ts';

describe('modelsForTier', () => {
  it('keeps cubic primitives through normal — GLBs only fit the top tiers', () => {
    for (const tier of ['very-low', 'low', 'normal'] as QualityTier[]) {
      expect(modelsForTier(tier)).toBe(CUBIC_MODELS);
    }
  });

  it('switches to the GLB set on high and very-high', () => {
    for (const tier of ['high', 'very-high'] as QualityTier[]) {
      expect(modelsForTier(tier)).toBe(GLTF_MODELS);
    }
  });
});

describe('GLTF_MODELS', () => {
  it('satisfies the ModelSet contract', () => {
    expect(GLTF_MODELS.kind).toBe('gltf');
    for (const slot of ['Figure', 'Landmark', 'Prop', 'Animal'] as const) {
      expect(GLTF_MODELS[slot]).toBeTypeOf('function');
    }
  });
});

describe('fitLandmark', () => {
  it('scales to the target height and grounds the base on y=0', () => {
    const fit = fitLandmark(HOME_GATE_BOUNDS, 1.4);
    expect(fit.scale).toBeCloseTo(1.4 / (HOME_GATE_BOUNDS.maxY - HOME_GATE_BOUNDS.minY), 5);
    // The scaled base vertex lands exactly on the ground plane.
    expect(HOME_GATE_BOUNDS.minY * fit.scale + fit.position[1]).toBeCloseTo(0, 6);
  });

  it('keeps the front face at or behind the hotspot clearance plane', () => {
    for (const [bounds, fit] of [
      [HOME_GATE_BOUNDS, HOME_GATE_FIT],
      [SHOP_BOUNDS, SHOP_FIT],
      [FOUNTAIN_BOUNDS, FOUNTAIN_FIT],
    ] as const) {
      const frontWorld = bounds.frontZ * fit.scale + fit.position[2];
      expect(frontWorld).toBeLessThanOrEqual(LANDMARK_MAX_DETAIL_Z + 1e-6);
    }
  });

  it('never places the base above or below the ground', () => {
    for (const [bounds, fit] of [
      [HOME_GATE_BOUNDS, HOME_GATE_FIT],
      [SHOP_BOUNDS, SHOP_FIT],
      [FOUNTAIN_BOUNDS, FOUNTAIN_FIT],
    ] as const) {
      expect(bounds.minY * fit.scale + fit.position[1]).toBeCloseTo(0, 6);
    }
  });

  it('centres radially symmetric models on the landmark origin', () => {
    const fit = fitLandmark(FOUNTAIN_BOUNDS, 1.0, { center: true });
    const frontWorld = FOUNTAIN_BOUNDS.frontZ * fit.scale + fit.position[2];
    const backWorld = FOUNTAIN_BOUNDS.backZ * fit.scale + fit.position[2];
    expect(frontWorld).toBeCloseTo(-backWorld, 6);
  });
});
