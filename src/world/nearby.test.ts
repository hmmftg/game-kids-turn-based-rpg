import { describe, expect, it } from 'vitest';
import { nearbyNpcs } from './nearby.ts';
import { getAnchor } from './navigation/graph.ts';
import { STATIC_WORLD_SOURCE } from './worldSource.ts';

const square = getAnchor(STATIC_WORLD_SOURCE, 'anchor-square');
const school = getAnchor(STATIC_WORLD_SOURCE, 'anchor-school');
const fountain = getAnchor(STATIC_WORLD_SOURCE, 'anchor-fountain');

describe('nearbyNpcs — the DOM accessibility route for figure taps', () => {
  it('returns on-map people nearest-first', () => {
    const entries = nearbyNpcs(STATIC_WORLD_SOURCE, 'map-town', { x: square.x, z: square.z }, 0);
    expect(entries.length).toBeGreaterThan(3);
    // Distances are non-decreasing.
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i]!.distance).toBeGreaterThanOrEqual(entries[i - 1]!.distance);
    }
    // The elder always stands at the square — nearest from the square.
    expect(entries[0]!.npc.id).toBe('npc-elder');
  });

  it('excludes people standing on another map', () => {
    const entries = nearbyNpcs(STATIC_WORLD_SOURCE, 'map-town', { x: square.x, z: square.z }, 0);
    expect(entries.some((e) => e.npc.id === 'npc-cave-mouse')).toBe(false);
  });

  it('follows schedule stands, not just home anchors', () => {
    // The playful mouse anchors at the fountain — nearest from there.
    const entries = nearbyNpcs(
      STATIC_WORLD_SOURCE,
      'map-town',
      { x: fountain.x, z: fountain.z },
      0,
      3,
    );
    expect(entries[0]!.npc.id).toBe('npc-playful-mouse');
    expect(entries[0]!.distance).toBeLessThan(2);
  });

  it('respects the limit', () => {
    const entries = nearbyNpcs(STATIC_WORLD_SOURCE, 'map-town', { x: school.x, z: school.z }, 0, 3);
    expect(entries).toHaveLength(3);
  });
});
