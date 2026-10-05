import type { Xyz } from './models/details.tsx';
import { isDecorationClear, isDecorationClearPath } from './decorations.ts';
import { ANCHORS } from './navigation/graph.ts';
import { landmarkPosition } from './placement.ts';

/**
 * Ambient animal data — authored, deterministic, presentation-only.
 *
 * Ground spots (cats, ground bird perches) are validated against the existing
 * decoration-clearance envelope (`decorations.ts`): the world-clearance data
 * lives in exactly one place. Cat patrols are authored so every reachable pair
 * within a patrol has a safe swept path — a cat never crosses a hotspot, NPC,
 * landmark or path corridor.
 */

export type CritterKind = 'cat' | 'bird' | 'eagle' | 'fish';

export interface GroundSpot {
  readonly x: number;
  readonly z: number;
}

export interface PerchSpot {
  readonly id: string;
  readonly position: Xyz;
  readonly host: 'roof' | 'dome' | 'awning' | 'fence' | 'rim' | 'ground';
  readonly allowed: readonly ('bird' | 'eagle')[];
}

/**
 * Airspace the ambient animals occupy; `WorldCanvas` folds this into its FIT
 * envelope so flying critters can't be clipped by the orthographic frustum.
 * The eagle's soar loop and every perch must stay inside these bounds.
 */
export const CRITTER_BOUNDS = {
  maxY: 3.0,
  maxHorizontalRadius: 4.0,
} as const;

export const CAT_FOOTPRINT = 0.4;

/** NE pocket — bounded by the north (x=0) and east (z=0) corridors. */
const CAT_PATROL_NE: readonly GroundSpot[] = [
  { x: 2.0, z: -1.6 },
  { x: 3.4, z: -2.2 },
  { x: 2.2, z: -3.6 },
  { x: 4.6, z: -3.0 },
  { x: 3.0, z: -5.0 },
  { x: 5.4, z: -3.8 },
];

/** SE pocket — bounded by the south (x=0) and east (z=0) corridors. */
const CAT_PATROL_SE: readonly GroundSpot[] = [
  { x: 2.4, z: 2.0 },
  { x: 4.4, z: 3.0 },
  { x: 3.0, z: 4.0 },
  { x: 5.2, z: 4.4 },
  { x: 2.2, z: 3.4 },
];

/** Each cat roams one corridor-bounded pocket; pairwise paths are test-verified. */
export const CAT_PATROLS: readonly (readonly GroundSpot[])[] = [CAT_PATROL_NE, CAT_PATROL_SE];

const FOUNTAIN_ANCHOR = ANCHORS.find((anchor) => anchor.id === 'anchor-fountain');

/**
 * Fountain basin: water disc centre + radius, derived from the fountain
 * anchor's landmark placement — fish can never drift away from the water
 * the landmark actually renders, and neither can a rim perch.
 */
export const FOUNTAIN_BASIN = {
  ...(FOUNTAIN_ANCHOR ? landmarkPosition(FOUNTAIN_ANCHOR) : { x: -6, z: -1.2 }),
  waterY: 0.36,
  radius: 0.45,
} as const;

export const BIRD_PERCHES: readonly PerchSpot[] = [
  { id: 'roof-home', position: [-0.75, 1.95, -7.2], host: 'roof', allowed: ['bird'] },
  { id: 'roof-garden', position: [0, 1.95, 4.8], host: 'roof', allowed: ['bird'] },
  { id: 'roof-square', position: [0.75, 1.95, -1.2], host: 'roof', allowed: ['bird'] },
  { id: 'awning-shop', position: [6, 1.05, -0.45], host: 'awning', allowed: ['bird'] },
  { id: 'fence-garden', position: [0, 0.32, 5.5], host: 'fence', allowed: ['bird'] },
  {
    id: 'rim-fountain',
    position: [-6, 0.45, FOUNTAIN_BASIN.z + 0.8],
    host: 'rim',
    allowed: ['bird'],
  },
  { id: 'ground-ne', position: [2.0, 0, -1.6], host: 'ground', allowed: ['bird'] },
  { id: 'ground-nw', position: [-2.2, 0, -2.4], host: 'ground', allowed: ['bird'] },
  { id: 'ground-nw2', position: [-3.8, 0, -3.0], host: 'ground', allowed: ['bird'] },
];

/** Eagle only lands on high, spacious perches — never a fence rail or sign. */
export const EAGLE_PERCHES: readonly PerchSpot[] = [
  { id: 'dome-home', position: [0, 2.35, -7.2], host: 'dome', allowed: ['eagle'] },
  { id: 'dome-square', position: [0, 2.3, -1.2], host: 'dome', allowed: ['eagle'] },
  { id: 'roof-shop', position: [6, 2.0, -1.2], host: 'roof', allowed: ['eagle'] },
];

/** Eagle soar loop — ellipse above the hub, inside CRITTER_BOUNDS. */
export const EAGLE_ORBIT = { rx: 4.0, rz: 3.0, minY: 2.4, maxY: 3.0 } as const;

export function perchPool(kind: 'bird' | 'eagle'): readonly PerchSpot[] {
  return kind === 'eagle' ? EAGLE_PERCHES : BIRD_PERCHES;
}

/** Deterministic LCG — no Math.random, stable sequences for tests/screenshots. */
export function nextSeed(seed: number): number {
  return (seed * 16807) % 2147483647;
}

export function seedUnit(seed: number): number {
  return seed / 2147483647;
}

/**
 * Pick the next spot from `pool`, excluding the current spot and any spot ids
 * another critter has claimed (occupied or targeted). Returns null if the
 * pool is exhausted.
 */
export function pickSpot<T extends { readonly id?: string }>(
  seed: number,
  pool: readonly T[],
  exclude: ReadonlySet<T | string | undefined>,
): T | null {
  const candidates = pool.filter((spot) => !exclude.has(spot) && !exclude.has(spot.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(seedUnit(seed) * candidates.length) % candidates.length] ?? null;
}

/** A cat hop is safe only when the swept path stays clear — not just endpoints. */
export function catPathIsSafe(from: GroundSpot, to: GroundSpot): boolean {
  return isDecorationClearPath(from, to, CAT_FOOTPRINT);
}

/** Ground spots (perches standing on the ground plane) must be clear too. */
export function groundSpotIsClear(spot: GroundSpot, radius = 0.35): boolean {
  return isDecorationClear(spot.x, spot.z, radius);
}

/**
 * Stable initial placements — screenshots and low tier show a fixed authored
 * composition; the seeded PRNG only controls subsequent motion.
 */
export interface CritterPlacement {
  readonly key: string;
  readonly kind: CritterKind;
  readonly tint?: string;
  readonly position: Xyz;
  readonly rotationY: number;
  /** Index into CAT_PATROLS / the kind's perch pool for subsequent picks. */
  readonly poolIndex: number;
  readonly spotId?: string;
  readonly seed: number;
}

export const INITIAL_CRITTER_PLACEMENTS: readonly CritterPlacement[] = [
  {
    key: 'cat-0',
    kind: 'cat',
    tint: '#d98a4a',
    position: [CAT_PATROL_NE[0]!.x, 0, CAT_PATROL_NE[0]!.z],
    rotationY: 0.6,
    poolIndex: 0,
    spotId: 'cat-0',
    seed: 101,
  },
  {
    key: 'cat-1',
    kind: 'cat',
    tint: '#8f8fa3',
    position: [CAT_PATROL_SE[1]!.x, 0, CAT_PATROL_SE[1]!.z],
    rotationY: -0.8,
    poolIndex: 1,
    spotId: 'cat-1',
    seed: 211,
  },
  {
    key: 'bird-0',
    kind: 'bird',
    tint: '#5b8ab5',
    position: BIRD_PERCHES[0]!.position,
    rotationY: 2.2,
    poolIndex: 0,
    spotId: BIRD_PERCHES[0]!.id,
    seed: 307,
  },
  {
    key: 'bird-1',
    kind: 'bird',
    tint: '#c96f8d',
    position: BIRD_PERCHES[5]!.position,
    rotationY: 0.9,
    poolIndex: 0,
    spotId: BIRD_PERCHES[5]!.id,
    seed: 419,
  },
  {
    key: 'bird-2',
    kind: 'bird',
    tint: '#7a8a5b',
    position: BIRD_PERCHES[7]!.position,
    rotationY: -1.4,
    poolIndex: 0,
    spotId: BIRD_PERCHES[7]!.id,
    seed: 523,
  },
  {
    key: 'eagle-0',
    kind: 'eagle',
    position: EAGLE_PERCHES[1]!.position,
    rotationY: 0.4,
    poolIndex: 0,
    spotId: EAGLE_PERCHES[1]!.id,
    seed: 641,
  },
  {
    key: 'fish-0',
    kind: 'fish',
    tint: '#e08a3c',
    position: [FOUNTAIN_BASIN.x + 0.4, FOUNTAIN_BASIN.waterY, FOUNTAIN_BASIN.z],
    rotationY: 1.57,
    poolIndex: 0,
    spotId: 'fish-0',
    seed: 733,
  },
  {
    key: 'fish-1',
    kind: 'fish',
    tint: '#a9d4e8',
    position: [FOUNTAIN_BASIN.x - 0.3, FOUNTAIN_BASIN.waterY, FOUNTAIN_BASIN.z + 0.3],
    rotationY: -0.9,
    poolIndex: 0,
    spotId: 'fish-1',
    seed: 887,
  },
];
