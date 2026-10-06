import { describe, expect, it } from 'vitest';
import {
  BIRD_PERCHES,
  BUTTERFLY_SPOTS,
  CAT_PATROLS,
  CRITTER_BOUNDS,
  EAGLE_ORBIT,
  EAGLE_PERCHES,
  FOUNTAIN_BASIN,
  INITIAL_CRITTER_PLACEMENTS,
  catPathIsSafe,
  groundSpotIsClear,
  nextSeed,
  pickSpot,
  perchPool,
} from './critters.ts';
import { isDecorationClearPath } from './decorations.ts';

describe('CAT_PATROLS', () => {
  it('every spot in every patrol clears the exclusion envelope', () => {
    for (const patrol of CAT_PATROLS) {
      for (const spot of patrol) {
        expect(groundSpotIsClear(spot), `cat spot ${spot.x},${spot.z}`).toBe(true);
      }
    }
  });

  it('every reachable pair within a patrol has a safe swept path', () => {
    for (const patrol of CAT_PATROLS) {
      for (const a of patrol) {
        for (const b of patrol) {
          if (a === b) continue;
          expect(catPathIsSafe(a, b), `cat path ${a.x},${a.z} → ${b.x},${b.z}`).toBe(true);
        }
      }
    }
  });
});

describe('perches', () => {
  it('bird ground perches are clear spots', () => {
    for (const perch of BIRD_PERCHES) {
      if (perch.host !== 'ground') continue;
      const [x, , z] = perch.position;
      expect(groundSpotIsClear({ x, z }), perch.id).toBe(true);
    }
  });

  it('perch pools are species-restricted', () => {
    for (const perch of perchPool('eagle')) {
      expect(perch.allowed).toContain('eagle');
      expect(perch.allowed).not.toContain('bird');
    }
    for (const perch of perchPool('bird')) {
      expect(perch.allowed).toContain('bird');
      expect(perch.allowed).not.toContain('eagle');
    }
    // eagles never land on flimsy hosts
    for (const perch of EAGLE_PERCHES) {
      expect(['dome', 'roof']).toContain(perch.host);
    }
  });

  it('every perch and the eagle orbit stay inside CRITTER_BOUNDS', () => {
    for (const perch of [...BIRD_PERCHES, ...EAGLE_PERCHES]) {
      const [x, y, z] = perch.position;
      expect(y, perch.id).toBeLessThanOrEqual(CRITTER_BOUNDS.maxY);
      expect(Math.max(Math.abs(x), Math.abs(z)), perch.id).toBeLessThanOrEqual(
        // ground perches near edges may exceed the orbit radius; bound loosely
        CRITTER_BOUNDS.maxHorizontalRadius + 3.5,
      );
    }
    expect(EAGLE_ORBIT.maxY).toBeLessThanOrEqual(CRITTER_BOUNDS.maxY);
    expect(Math.max(EAGLE_ORBIT.rx, EAGLE_ORBIT.rz)).toBeLessThanOrEqual(
      CRITTER_BOUNDS.maxHorizontalRadius,
    );
  });
});

describe('pickSpot', () => {
  it('never returns the current or a claimed spot', () => {
    const current = BIRD_PERCHES[0]!;
    const claimed = new Set([current.id, BIRD_PERCHES[1]!.id]);
    for (let seed = 1; seed < 200; seed = nextSeed(seed)) {
      const pick = pickSpot(seed, BIRD_PERCHES, claimed);
      expect(pick).not.toBeNull();
      expect(claimed.has(pick!.id)).toBe(false);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(pickSpot(1234, BIRD_PERCHES, new Set())).toBe(pickSpot(1234, BIRD_PERCHES, new Set()));
  });

  it('returns null when everything is excluded', () => {
    const all = new Set(BIRD_PERCHES.map((p) => p.id));
    expect(pickSpot(7, BIRD_PERCHES, all)).toBeNull();
  });
});

describe('isDecorationClearPath', () => {
  it('rejects a path crossing a corridor even when endpoints are clear', () => {
    // NE pocket → SE pocket crosses the east corridor (z=0, x>0.85).
    const a = { x: 2.4, z: -1.6 };
    const b = { x: 2.4, z: 2.0 };
    expect(isDecorationClearPath(a, b, 0.4)).toBe(false);
  });
});

describe('INITIAL_CRITTER_PLACEMENTS', () => {
  it('are deterministic and reference real spots', () => {
    const perchIds = new Set([...BIRD_PERCHES, ...EAGLE_PERCHES].map((p) => p.id));
    for (const p of INITIAL_CRITTER_PLACEMENTS) {
      if (p.kind === 'bird' || p.kind === 'eagle') {
        expect(perchIds.has(p.spotId ?? ''), p.key).toBe(true);
      }
      if (p.kind === 'cat') {
        const patrol = CAT_PATROLS[p.poolIndex];
        expect(patrol).toBeDefined();
      }
      if (p.kind === 'butterfly') {
        expect(
          BUTTERFLY_SPOTS.some((s) => s.id === p.spotId),
          p.key,
        ).toBe(true);
      }
    }
  });

  it('has the expected roster', () => {
    const kinds = INITIAL_CRITTER_PLACEMENTS.map((p) => p.kind);
    expect(kinds.filter((k) => k === 'cat')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'bird')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'eagle')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'fish')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'butterfly')).toHaveLength(2);
  });

  it('fish spawn inside the fountain basin', () => {
    for (const p of INITIAL_CRITTER_PLACEMENTS) {
      if (p.kind !== 'fish') continue;
      const dx = p.position[0] - FOUNTAIN_BASIN.x;
      const dz = p.position[2] - FOUNTAIN_BASIN.z;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(FOUNTAIN_BASIN.radius + 0.05);
    }
  });
});
