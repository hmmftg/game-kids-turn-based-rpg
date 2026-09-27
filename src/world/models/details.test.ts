import { describe, expect, it } from 'vitest';
import type { QualityTier } from '../../domain/game/types.ts';
import { detailLevelFor } from './modelProvider.ts';
import { PATH_STONE_CLEARANCE, pathStonePositions } from './details.tsx';
import { sharedLambert, sharedMaterialCount } from './shared.ts';
import { EDGES, getAnchor } from '../navigation/graph.ts';

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

describe('pathStonePositions', () => {
  it('keeps every stone at least PATH_STONE_CLEARANCE from both anchors', () => {
    for (const edge of EDGES) {
      const from = getAnchor(edge.from);
      const to = getAnchor(edge.to);
      for (const [x, , z] of pathStonePositions(from, to, 6)) {
        expect(Math.hypot(x - from.x, z - from.z)).toBeGreaterThanOrEqual(PATH_STONE_CLEARANCE);
        expect(Math.hypot(x - to.x, z - to.z)).toBeGreaterThanOrEqual(PATH_STONE_CLEARANCE);
      }
    }
  });

  it('places no stones when the edge is shorter than both clear zones', () => {
    expect(pathStonePositions({ x: 0, z: 0 }, { x: 1, z: 0 }, 4, 0.55, 1.2)).toEqual([]);
  });
});
