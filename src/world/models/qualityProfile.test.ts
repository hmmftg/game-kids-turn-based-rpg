import { describe, expect, it } from 'vitest';
import { profileFor } from './qualityProfile.ts';
import {
  BOX,
  CYLINDER,
  SPHERE,
  cylinderFor,
  roundedBoxFor,
  sharedGeometryCount,
  sphereFor,
} from './shared.ts';

describe('profileFor', () => {
  it('maps each detail level to a deterministic profile', () => {
    expect(profileFor(0)).toBe(profileFor(0));
    expect(profileFor(1).level).toBe(1);
    expect(profileFor(2).level).toBe(2);
    expect(profileFor(3).level).toBe(3);
    expect(profileFor(6).level).toBe(6);
  });

  it('level 0 reproduces the original fixed geometry parameters', () => {
    const low = profileFor(0);
    expect(low.radialSegments).toBe(12);
    expect(low.sphere).toEqual({ width: 12, height: 8 });
    expect(low.clothingAccents).toBe(false);
    expect(low.animalAccents).toBe(false);
  });

  it('refines monotonically: each level is at least as detailed as the one below', () => {
    const levels = [0, 1, 2, 3, 4, 5, 6].map(profileFor);
    for (let i = 1; i < levels.length; i += 1) {
      const prev = levels[i - 1]!;
      const cur = levels[i]!;
      expect(cur.radialSegments).toBeGreaterThanOrEqual(prev.radialSegments);
      expect(cur.sphere.width).toBeGreaterThanOrEqual(prev.sphere.width);
      expect(cur.sphere.height).toBeGreaterThanOrEqual(prev.sphere.height);
      expect(cur.roundedBox.radius).toBeGreaterThanOrEqual(prev.roundedBox.radius);
      expect(cur.roundedBox.segments).toBeGreaterThanOrEqual(prev.roundedBox.segments);
    }
    // The refinement must actually move somewhere on every step — a tier that
    // changes nothing is imperceptible and should not exist.
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).not.toEqual(levels[i - 1]);
    }
    expect(levels[1]!.clothingAccents).toBe(true);
    expect(levels[1]!.animalAccents).toBe(true);
    // High rounds corners wider than Medium at the same subdivision cost.
    expect(levels[2]!.roundedBox.radius).toBeGreaterThan(levels[1]!.roundedBox.radius);
    // The two new top tiers keep refining past High.
    expect(levels[3]!.sphere.width).toBeGreaterThan(levels[2]!.sphere.width);
    expect(levels[4]!.sphere.width).toBeGreaterThan(levels[3]!.sphere.width);
    expect(levels[4]!.roundedBox.radius).toBeGreaterThan(levels[3]!.roundedBox.radius);
    expect(levels[5]!.sphere.width).toBeGreaterThan(levels[4]!.sphere.width);
    expect(levels[6]!.sphere.width).toBeGreaterThan(levels[5]!.sphere.width);
    expect(levels[6]!.roundedBox.radius).toBeGreaterThan(levels[5]!.roundedBox.radius);
  });

  it('clamps out-of-range levels instead of producing an undefined profile', () => {
    expect(profileFor(-1)).toBe(profileFor(0));
    expect(profileFor(99)).toBe(profileFor(6));
  });
});

describe('tier-aware shared geometry', () => {
  it('level 0 returns the exact existing geometry objects', () => {
    expect(sphereFor(0)).toBe(SPHERE);
    expect(cylinderFor(0)).toBe(CYLINDER);
    expect(roundedBoxFor(0)).toBe(BOX);
  });

  it('returns the same instance for repeated calls at a level', () => {
    expect(sphereFor(1)).toBe(sphereFor(1));
    expect(cylinderFor(2, 0.8)).toBe(cylinderFor(2, 0.8));
    expect(roundedBoxFor(2)).toBe(roundedBoxFor(2));
  });

  it('keeps the cache bounded across levels and options', () => {
    const before = sharedGeometryCount();
    for (const level of [0, 1, 2, 3, 4] as const) {
      sphereFor(level);
      cylinderFor(level);
      cylinderFor(level, 0.8);
      roundedBoxFor(level);
    }
    // sphere: 4 variants, cylinder: 4 tapered + 4 untapered, rounded box: 4.
    expect(sharedGeometryCount()).toBeLessThanOrEqual(before + 16);
  });

  it('cache keys distinguish every geometry-affecting parameter', () => {
    expect(cylinderFor(2, 0.8)).not.toBe(cylinderFor(2, 1));
    // Same params across levels share one instance (16-seg at medium & high);
    // distinct segment counts get distinct geometry (16 vs 20).
    expect(cylinderFor(1, 1)).toBe(cylinderFor(2, 1));
    expect(cylinderFor(2, 1)).not.toBe(cylinderFor(3, 1));
    expect(roundedBoxFor(1)).not.toBe(roundedBoxFor(2));
    expect(sphereFor(3)).not.toBe(sphereFor(4));
  });
});
