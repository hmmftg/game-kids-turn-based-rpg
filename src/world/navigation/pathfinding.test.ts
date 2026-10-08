import { describe, expect, it } from 'vitest';
import { ANCHORS, getAnchor, neighboursOf } from './graph.ts';
import { findPath, nearestWalkableAnchor, pathToPoints } from './pathfinding.ts';
import { STATIC_WORLD_SOURCE, worldForDiscoveries } from '../worldSource.ts';

describe('waypoint graph', () => {
  it('exposes only walkable neighbours', () => {
    expect(neighboursOf(STATIC_WORLD_SOURCE, 'anchor-path-west')).not.toContain('anchor-fountain');
    expect(neighboursOf(STATIC_WORLD_SOURCE, 'anchor-square')).toContain('anchor-path-north');
  });

  it('keeps every anchor id unique', () => {
    expect(new Set(ANCHORS.map((a) => a.id)).size).toBe(ANCHORS.length);
  });
});

describe('findPath', () => {
  it('returns a single node when already there', () => {
    expect(findPath(STATIC_WORLD_SOURCE, 'anchor-square', 'anchor-square')).toEqual([
      'anchor-square',
    ]);
  });

  it('routes through intermediate waypoints', () => {
    expect(findPath(STATIC_WORLD_SOURCE, 'anchor-home-gate', 'anchor-shop')).toEqual([
      'anchor-home-gate',
      'anchor-path-north',
      'anchor-square',
      'anchor-path-east',
      'anchor-shop',
    ]);
  });

  it('is symmetric', () => {
    const forward = findPath(STATIC_WORLD_SOURCE, 'anchor-garden', 'anchor-friend');
    const backward = [...findPath(STATIC_WORLD_SOURCE, 'anchor-friend', 'anchor-garden')].reverse();
    expect(forward).toEqual(backward);
  });

  it('refuses to path into an unwalkable anchor', () => {
    expect(findPath(STATIC_WORLD_SOURCE, 'anchor-square', 'anchor-fountain')).toEqual([]);
  });

  it('maps a path to ground points', () => {
    const points = pathToPoints(
      STATIC_WORLD_SOURCE,
      findPath(STATIC_WORLD_SOURCE, 'anchor-square', 'anchor-path-east'),
    );
    expect(points).toEqual([
      { x: 0, z: 0 },
      { x: 3, z: 0 },
    ]);
  });
});

describe('nearestWalkableAnchor', () => {
  it('resolves a tap to the closest walkable anchor', () => {
    const anchor = getAnchor(STATIC_WORLD_SOURCE, 'anchor-shop');
    expect(nearestWalkableAnchor(STATIC_WORLD_SOURCE, anchor.x + 0.4, anchor.z - 0.3)).toBe(
      'anchor-shop',
    );
  });

  it('never resolves to an unwalkable anchor', () => {
    const fountain = getAnchor(STATIC_WORLD_SOURCE, 'anchor-fountain');
    expect(nearestWalkableAnchor(STATIC_WORLD_SOURCE, fountain.x, fountain.z, 4, 'map-town')).toBe(
      'anchor-path-west',
    );
  });

  it('returns null when the tap is outside the allowed radius', () => {
    expect(nearestWalkableAnchor(STATIC_WORLD_SOURCE, 100, 100, 2)).toBeNull();
  });
});

describe('worldForDiscoveries gated edges', () => {
  it('a gated path is unreachable before its fact and reachable after', () => {
    // The depths sit behind edges that require a challenge victory fact —
    // the static (unfiltered) world always contains them; the fact-filtered
    // world is what the child actually walks.
    const closed = worldForDiscoveries(STATIC_WORLD_SOURCE, []);
    expect(findPath(closed, 'anchor-challenge-path-2', 'anchor-challenge-depths')).toEqual([]);
    const opened = worldForDiscoveries(STATIC_WORLD_SOURCE, ['discovery-challenge-butterfly']);
    expect(
      findPath(opened, 'anchor-challenge-path-2', 'anchor-challenge-depths').length,
    ).toBeGreaterThan(0);
  });

  it('the filter changes only edges — every other table is shared by reference', () => {
    const filtered = worldForDiscoveries(STATIC_WORLD_SOURCE, []);
    expect(filtered.maps).toBe(STATIC_WORLD_SOURCE.maps);
    expect(filtered.areas).toBe(STATIC_WORLD_SOURCE.areas);
    expect(filtered.anchors).toBe(STATIC_WORLD_SOURCE.anchors);
    expect(filtered.transitions).toBe(STATIC_WORLD_SOURCE.transitions);
    expect(filtered.npcDefinitions).toBe(STATIC_WORLD_SOURCE.npcDefinitions);
    expect(filtered.npcPlacements).toBe(STATIC_WORLD_SOURCE.npcPlacements);
    // With every fact recorded the source comes back identical (no copy).
    expect(
      worldForDiscoveries(STATIC_WORLD_SOURCE, [
        'discovery-challenge-butterfly',
        'discovery-challenge-eagle',
      ]),
    ).toBe(STATIC_WORLD_SOURCE);
  });
});
