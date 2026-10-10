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
  });

  it('level 0 reproduces the original fixed geometry parameters', () => {
    const low = profileFor(0);
    expect(low.radialSegments).toBe(12);
    expect(low.sphere).toEqual({ width: 12, height: 8 });
    expect(low.clothingAccents).toBe(false);
    expect(low.animalAccents).toBe(false);
  });

  it('refines monotonically: each level is at least as detailed as the one below', () => {
    const [low, medium, high] = [profileFor(0), profileFor(1), profileFor(2)];
    expect(medium.radialSegments).toBeGreaterThan(low.radialSegments);
    expect(high.radialSegments).toBeGreaterThan(medium.radialSegments);
    expect(medium.sphere.width).toBeGreaterThan(low.sphere.width);
    expect(high.sphere.width).toBeGreaterThan(medium.sphere.width);
    expect(medium.sphere.height).toBeGreaterThan(low.sphere.height);
    expect(high.sphere.height).toBeGreaterThan(medium.sphere.height);
    expect(medium.clothingAccents).toBe(true);
    expect(medium.animalAccents).toBe(true);
    expect(high.clothingAccents).toBe(true);
    expect(high.animalAccents).toBe(true);
    // High rounds corners wider than Medium at the same subdivision cost.
    expect(high.roundedBox.radius).toBeGreaterThan(medium.roundedBox.radius);
    expect(high.roundedBox.segments).toBeGreaterThanOrEqual(medium.roundedBox.segments);
  });

  it('clamps out-of-range levels instead of producing an undefined profile', () => {
    expect(profileFor(-1)).toBe(profileFor(0));
    expect(profileFor(99)).toBe(profileFor(2));
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
    for (const level of [0, 1, 2] as const) {
      sphereFor(level);
      cylinderFor(level);
      cylinderFor(level, 0.8);
      roundedBoxFor(level);
    }
    // sphere: 2 variants, cylinder: 2 tapered + 2 untapered, rounded box: 2.
    expect(sharedGeometryCount()).toBeLessThanOrEqual(before + 8);
  });

  it('cache keys distinguish every geometry-affecting parameter', () => {
    expect(cylinderFor(2, 0.8)).not.toBe(cylinderFor(2, 1));
    expect(cylinderFor(1, 1)).not.toBe(cylinderFor(2, 1));
    expect(roundedBoxFor(1)).not.toBe(roundedBoxFor(2));
  });
});
