import type { DetailLevel } from './modelProvider.ts';

/**
 * Centralized geometry-quality profile — the only place a `DetailLevel` is
 * turned into concrete geometry parameters. Models read this instead of
 * scattering segment counts and tier checks through the scene.
 *
 * Level mapping matches `detailLevelFor` (low → 0, medium → 1, high → 2).
 * Level 0 must reproduce the previous fixed geometry exactly: the shared
 * `CYLINDER` (12 radial segments) and `SPHERE` (12×8) objects, box heads,
 * box limbs-adjacent pieces. Higher levels refine the *same* shapes — never
 * a redesign: proportions, palettes and silhouettes stay authored in the
 * model components, the profile only controls how smoothly they resolve.
 */
export interface GeometryProfile {
  readonly level: DetailLevel;
  /**
   * Radial (around-the-axis) segments for cylinders and cone-like pieces.
   * Level 0 keeps the historical value of 12.
   */
  readonly radialSegments: number;
  /**
   * Sphere tessellation as { widthSegments, heightSegments }.
   * Level 0 keeps the historical 12×8 sphere.
   */
  readonly sphere: { readonly width: number; readonly height: number };
  /**
   * Corner rounding for the figure's main masses (head and torso — the two
   * largest visible surfaces). `radius` is in unit-box space (the geometry
   * is a 1×1×1 rounded box scaled by each mesh's existing scale), `segments`
   * is the corner resolution passed to RoundedBoxGeometry. Level 0 uses the
   * plain shared `BOX` — `roundedBox` values are ignored there. Deliberately
   * NOT applied to small accents (cheeks, muzzle, beak): rounding is
   * imperceptible below ~10 px at hub camera distance and would only cost
   * triangles.
   */
  readonly roundedBox: { readonly radius: number; readonly segments: number };
  /**
   * Modeled secondary details layered on top of the level-0 silhouette:
   * collars, cuffs, hems (figures) and muzzle/ear/beak refinements (animals).
   * Each remains gated per-piece by `<Detail level min>` — these flags only
   * express which refinement band a level qualifies for.
   */
  readonly clothingAccents: boolean;
  readonly animalAccents: boolean;
}

const LOW: GeometryProfile = {
  level: 0,
  radialSegments: 12,
  sphere: { width: 12, height: 8 },
  roundedBox: { radius: 0, segments: 1 },
  clothingAccents: false,
  animalAccents: false,
};

const MEDIUM: GeometryProfile = {
  level: 1,
  radialSegments: 16,
  sphere: { width: 14, height: 10 },
  // Corner rounding tuned for the figure head: authored head box is
  // 0.42×0.38×0.38, so radius 0.18 in unit space ≈ 0.07 world units at the
  // narrowest axis — softens the cube silhouette without becoming a ball.
  // `segments` is the corner subdivision count, NOT a smoothing factor: each
  // step roughly doubles RoundedBoxGeometry triangles (2 → ~300 tris), so it
  // stays low — the rounding is a silhouette cue at hub camera distance.
  roundedBox: { radius: 0.18, segments: 2 },
  clothingAccents: true,
  animalAccents: true,
};

const HIGH: GeometryProfile = {
  level: 2,
  radialSegments: 16,
  sphere: { width: 16, height: 11 },
  // Same corner subdivision as Medium — a wider radius gives High its
  // softer silhouette without another ~300 triangles per rounded mesh.
  roundedBox: { radius: 0.22, segments: 2 },
  clothingAccents: true,
  animalAccents: true,
};

const PROFILES: readonly GeometryProfile[] = [LOW, MEDIUM, HIGH];

/**
 * Deterministic lookup. Out-of-range levels clamp into the profile range so
 * a stray value can never produce an undefined profile or a new code path.
 */
export function profileFor(level: DetailLevel | number): GeometryProfile {
  if (level <= 0) return LOW;
  if (level >= 2) return HIGH;
  return MEDIUM;
}

export { PROFILES };
