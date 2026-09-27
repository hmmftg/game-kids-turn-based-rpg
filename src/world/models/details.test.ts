import { describe, expect, it } from 'vitest';
import type { QualityTier } from '../../domain/game/types.ts';
import { detailLevelFor } from './modelProvider.ts';
import { sharedLambert, sharedMaterialCount } from './shared.ts';

describe('detailLevelFor', () => {
  it('is the single quality-tier → detail-level mapping', () => {
    const expected: Record<QualityTier, 0 | 1 | 2> = { low: 0, medium: 1, high: 2 };
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(detailLevelFor(tier)).toBe(expected[tier]);
    }
  });
});

describe('sharedLambert', () => {
  it('returns the same material instance for the same color', () => {
    expect(sharedLambert('#aabbcc')).toBe(sharedLambert('#aabbcc'));
  });

  it('returns different instances for different colors', () => {
    expect(sharedLambert('#112233')).not.toBe(sharedLambert('#445566'));
  });

  it('never allocates more than one material per color', () => {
    const before = sharedMaterialCount();
    sharedLambert('#feed01');
    const afterFirst = sharedMaterialCount();
    sharedLambert('#feed01');
    sharedLambert('#feed01');
    expect(afterFirst).toBe(before + 1);
    expect(sharedMaterialCount()).toBe(afterFirst);
  });
});
