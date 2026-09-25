import { describe, expect, it } from 'vitest';
import { ANCHORS, getAnchor, neighboursOf } from './graph.ts';
import { findPath, nearestWalkableAnchor, pathToPoints } from './pathfinding.ts';

describe('waypoint graph', () => {
  it('exposes only walkable neighbours', () => {
    expect(neighboursOf('anchor-path-west')).not.toContain('anchor-fountain');
    expect(neighboursOf('anchor-square')).toContain('anchor-path-north');
  });

  it('keeps every anchor id unique', () => {
    expect(new Set(ANCHORS.map((a) => a.id)).size).toBe(ANCHORS.length);
  });
});

describe('findPath', () => {
  it('returns a single node when already there', () => {
    expect(findPath('anchor-square', 'anchor-square')).toEqual(['anchor-square']);
  });

  it('routes through intermediate waypoints', () => {
    expect(findPath('anchor-home-gate', 'anchor-shop')).toEqual([
      'anchor-home-gate',
      'anchor-path-north',
      'anchor-square',
      'anchor-path-east',
      'anchor-shop',
    ]);
  });

  it('is symmetric', () => {
    const forward = findPath('anchor-garden', 'anchor-friend');
    const backward = [...findPath('anchor-friend', 'anchor-garden')].reverse();
    expect(forward).toEqual(backward);
  });

  it('refuses to path into an unwalkable anchor', () => {
    expect(findPath('anchor-square', 'anchor-fountain')).toEqual([]);
  });

  it('maps a path to ground points', () => {
    const points = pathToPoints(findPath('anchor-square', 'anchor-path-east'));
    expect(points).toEqual([
      { x: 0, z: 0 },
      { x: 3, z: 0 },
    ]);
  });
});

describe('nearestWalkableAnchor', () => {
  it('resolves a tap to the closest walkable anchor', () => {
    const anchor = getAnchor('anchor-shop');
    expect(nearestWalkableAnchor(anchor.x + 0.4, anchor.z - 0.3)).toBe('anchor-shop');
  });

  it('never resolves to an unwalkable anchor', () => {
    const fountain = getAnchor('anchor-fountain');
    expect(nearestWalkableAnchor(fountain.x, fountain.z)).toBe('anchor-path-west');
  });

  it('returns null when the tap is outside the allowed radius', () => {
    expect(nearestWalkableAnchor(100, 100, 2)).toBeNull();
  });
});
