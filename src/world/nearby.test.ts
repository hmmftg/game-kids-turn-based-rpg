import { describe, expect, it } from 'vitest';
import { nearbyNpcs } from './nearby.ts';
import { getAnchor } from './navigation/graph.ts';
import { NPC_DEFINITIONS, resolveNpcStand } from './registry.ts';
import { STATIC_WORLD_SOURCE } from './worldSource.ts';

const square = getAnchor(STATIC_WORLD_SOURCE, 'anchor-square');
const school = getAnchor(STATIC_WORLD_SOURCE, 'anchor-school');
const mouse = NPC_DEFINITIONS.find((n) => n.id === 'npc-playful-mouse')!;

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
    // The playful mouse strolls its Challenge Zone schedule — at a tick where
    // it rests at the den, querying there finds it (its HOME anchor is the
    // mouse spot, so this only passes if stands follow the schedule).
    const den = getAnchor(STATIC_WORLD_SOURCE, 'anchor-challenge-mouse-den');
    const tick = [0, 1, 2, 3].find(
      (t) =>
        resolveNpcStand(STATIC_WORLD_SOURCE, mouse, t).anchorId === 'anchor-challenge-mouse-den',
    )!;
    const entries = nearbyNpcs(
      STATIC_WORLD_SOURCE,
      'map-challenge',
      { x: den.x, z: den.z },
      tick,
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
