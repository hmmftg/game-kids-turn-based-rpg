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
 * POSITION bounds: x[-0.84,0.84] y[-0.01,0.91] z[-0.81,0.84].
 * The decorated face (door + window band, visible in the vertex data) is -z,
 * so the model mounts with `rotationY: π`; the bounds below are stated AFTER
 * that rotation (front = original -z face).
 */
export const HOME_GATE_BOUNDS: GlbBounds = {
  minY: -0.009,
  maxY: 0.905,
  frontZ: 0.81,
  backZ: -0.837,
};

/**
 * KayKit Medieval Builder Pack 1.0 — market.gltf.glb.
 * POSITION bounds: x[-0.75,0.72] y[-0.04,0.82] z[-0.76,0.90].
 * Front face is +z after `rotationY: 0`.
 */
export const SHOP_BOUNDS: GlbBounds = { minY: -0.041, maxY: 0.815, frontZ: 0.903, backZ: -0.761 };

/**
 * KayKit Medieval Builder Pack 1.0 — well.gltf.glb.
 * POSITION bounds: x[-0.51,0.51] y[0,0.73] z[-0.51,0.51]. Radially symmetric;
 * `center` keeps the well over the landmark origin (and the fountain's
 * ReactiveProp disc).
 */
export const FOUNTAIN_BOUNDS: GlbBounds = {
  minY: -0.002,
  maxY: 0.734,
  frontZ: 0.509,
  backZ: -0.509,
};

export const HOME_GATE_FIT: LandmarkFit = fitLandmark(HOME_GATE_BOUNDS, 1.4, {
  rotationY: Math.PI,
});
export const SHOP_FIT: LandmarkFit = fitLandmark(SHOP_BOUNDS, 1.25);
export const FOUNTAIN_FIT: LandmarkFit = fitLandmark(FOUNTAIN_BOUNDS, 1.0, { center: true });

/**
 * Prop/critter placement — no clearance plane, just: fit `size` to the
 * model's largest axis, centre the footprint on the prop origin, rest the
 * base on y=0. `bounds` are the raw POSITION min/max triples measured from
 * the shipped file via scripts/convert-model.ts output.
 */
export interface GlbFit {
  readonly scale: number;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}

export interface GlbExtents {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export function fitToSize(
  bounds: GlbExtents,
  size: number,
  opts: { readonly rotationY?: number } = {},
): GlbFit {
  const span = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const scale = size / span;
  return {
    scale,
    position: [
      -((bounds.min[0] + bounds.max[0]) / 2) * scale,
      -bounds.min[1] * scale,
      -((bounds.min[2] + bounds.max[2]) / 2) * scale,
    ],
    rotationY: opts.rotationY ?? 0,
  };
}

/** Mini-Game `ball.gltf.glb`: 2-unit sphere centred on the origin. */
export const BALL_BOUNDS: GlbExtents = { min: [-1, -1, -0.985], max: [1, 1, 0.985] };

/** City Builder `box_A.gltf` (texture stripped): a 0.2-unit cardboard box. */
export const CRATE_BOUNDS: GlbExtents = { min: [-0.1, 0, -0.1], max: [0.1, 0.176, 0.103] };

/**
 * Mini-Game `character_duck.gltf` — vertex-color single mesh. `flatten()`
 * resolved the assembly's node offsets, so these are true world-space bounds
 * (feet at y=0, head at ~1.9).
 */
export const DUCK_BOUNDS: GlbExtents = {
  min: [-0.5, 0, -0.483],
  max: [0.483, 1.892, 0.652],
};

/** Mini-Game `character_dog.gltf` — same flattened assembly as the duck. */
export const DOG_BOUNDS: GlbExtents = {
  min: [-0.692, 0, -0.483],
  max: [0.692, 1.638, 0.729],
};

/**
 * Scenery bounds — Forest Nature / City Builder trees and rocks plus the
 * Mini-Game farm plot, all vertex-color single meshes.
 * Trees are narrow verticals (~0.75 tall); `rocks` is a wide formation;
 * `farm` is a fenced plot almost as deep as it is wide.
 */
export const TREE_A_BOUNDS: GlbExtents = {
  min: [-0.272, 0, -0.194],
  max: [0.311, 0.78, 0.192],
};
export const TREE_B_BOUNDS: GlbExtents = {
  min: [-0.246, 0, -0.164],
  max: [0.238, 0.727, 0.164],
};
export const TREE_C_BOUNDS: GlbExtents = {
  min: [-0.277, -0.001, -0.173],
  max: [0.259, 0.757, 0.249],
};
export const ROCKS_BOUNDS: GlbExtents = {
  min: [-0.935, -0.051, -0.829],
  max: [0.957, 0.513, 0.501],
};
export const ROCKS_SMALL_BOUNDS: GlbExtents = {
  min: [-0.266, -0.013, -0.189],
  max: [0.38, 0.199, 0.34],
};
export const FARM_BOUNDS: GlbExtents = {
  min: [-0.736, -0.016, -0.642],
  max: [0.736, 0.441, 0.642],
};

/** Medieval `fence.gltf.glb` — a 2-unit run, 1.4 tall, ~0.11 deep. */
export const FENCE_BOUNDS: GlbExtents = {
  min: [-1, 0, -0.057],
  max: [1, 1.4, 0.057],
};

/** City Builder path tiles — flat squares ~1.68 across, 0.05 thick. */
export const PATH_COBBLED_BOUNDS: GlbExtents = {
  min: [-0.837, 0, -0.838],
  max: [0.839, 0.054, 0.838],
};
export const PATH_DIRT_BOUNDS: GlbExtents = {
  min: [-0.784, 0, -0.824],
  max: [0.801, 0.054, 0.858],
};

/**
 * Sketchfab `koi` — vertex colors sampled from the painted jpeg.
 * Authored nose-first along -x (bounds are heavily x-dominant), so the fit
 * rotates +π/2 to face +z. Its length axis maps to the fit's span.
 */
export const KOI_BOUNDS: GlbExtents = {
  min: [-3.523, -1.179, -1.19],
  max: [2.868, 1.714, 1.155],
};

/**
 * Sketchfab `elephant` — vertex colors sampled from its painted texture
 * after `--unskin` baked the bind pose to world space. Head + trunk sit
 * at +x (the ear cluster), so the fit rotates -π/2 to face +z. The x span
 * dominates, so `fitToSize` reads size as trunk-to-tail length.
 */
export const ELEPHANT_BOUNDS: GlbExtents = {
  min: [-53.514, -0.391, -35.862],
  max: [93.829, 87.921, 35.938],
};
