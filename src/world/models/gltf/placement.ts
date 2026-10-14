import { LANDMARK_MAX_DETAIL_Z } from '../cubic.tsx';

/**
 * Geometry-aware placement for GLB landmarks.
 *
 * Cubic landmarks sit at `anchor.z - 1.2` (landmarkPosition in
 * src/world/placement.ts) facing +z toward the anchor, where the hotspot ring
 * and the avatar's approach point live. A GLB must land in the same slot:
 * base on the ground, façade toward the anchor, and its front face at or
 * behind `LANDMARK_MAX_DETAIL_Z` so the clearance to the hotspot stays the
 * 0.45 the cubic landmark guarantees.
 *
 * `bounds` are measured from the shipped file (POSITION accessor min/max).
 * They are stated per model below — never guessed at runtime.
 */
export interface GlbBounds {
  /** Lowest local y — rests on the ground after the fit. */
  readonly minY: number;
  /** Highest local y — determines the scale needed for a target height. */
  readonly maxY: number;
  /** Local z of the face toward the anchor, AFTER `rotationY` is applied. */
  readonly frontZ: number;
  /** Local z of the far side, AFTER `rotationY` is applied. */
  readonly backZ: number;
}

export interface LandmarkFit {
  readonly scale: number;
  /** Local offset applied to the scaled, rotated model. */
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}

/**
 * Scale `bounds` to `height`, put its base on y=0, and slide it along z so
 * the front face sits at `frontZ` (default: the hotspot-clearance plane).
 * `center: true` instead centres the footprint on the landmark origin — the
 * right choice for radially symmetric scenery like the well.
 */
export function fitLandmark(
  bounds: GlbBounds,
  height: number,
  opts: { readonly rotationY?: number; readonly frontZ?: number; readonly center?: boolean } = {},
): LandmarkFit {
  const scale = height / (bounds.maxY - bounds.minY);
  const offsetZ = opts.center
    ? -((bounds.frontZ + bounds.backZ) / 2) * scale
    : (opts.frontZ ?? LANDMARK_MAX_DETAIL_Z) - bounds.frontZ * scale;
  return {
    scale,
    position: [0, -bounds.minY * scale, offsetZ],
    rotationY: opts.rotationY ?? 0,
  };
}

/**
 * KayKit Medieval Builder Pack 1.0 — house.gltf.glb.
 * POSITION bounds: x[-0.84,0.84] y[-0.01,0.90] z[-0.82,0.84].
 * The decorated face (door + window band, visible in the vertex data) is -z,
 * so the model mounts with `rotationY: π`; the bounds below are stated AFTER
 * that rotation (front = original -z face).
 */
export const HOME_GATE_BOUNDS: GlbBounds = { minY: -0.01, maxY: 0.9, frontZ: 0.82, backZ: -0.84 };

/**
 * KayKit Medieval Builder Pack 1.0 — market.gltf.glb.
 * POSITION bounds: x[-0.75,0.72] y[-0.04,0.82] z[-0.77,0.90].
 * Front face is +z after `rotationY: 0`.
 */
export const SHOP_BOUNDS: GlbBounds = { minY: -0.04, maxY: 0.82, frontZ: 0.9, backZ: -0.77 };

/**
 * KayKit Medieval Builder Pack 1.0 — well.gltf.glb.
 * POSITION bounds: x[-0.51,0.51] y[0,0.73] z[-0.51,0.51]. Radially symmetric;
 * `center` keeps the well over the landmark origin (and the fountain's
 * ReactiveProp disc).
 */
export const FOUNTAIN_BOUNDS: GlbBounds = { minY: 0, maxY: 0.73, frontZ: 0.51, backZ: -0.51 };

export const HOME_GATE_FIT: LandmarkFit = fitLandmark(HOME_GATE_BOUNDS, 1.4, {
  rotationY: Math.PI,
});
export const SHOP_FIT: LandmarkFit = fitLandmark(SHOP_BOUNDS, 1.25);
export const FOUNTAIN_FIT: LandmarkFit = fitLandmark(FOUNTAIN_BOUNDS, 1.0, { center: true });
