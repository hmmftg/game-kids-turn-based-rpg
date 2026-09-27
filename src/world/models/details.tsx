import type { ReactNode } from 'react';
import type { DetailLevel } from './modelProvider.ts';
import { noRaycast } from './raycast.ts';
import { BOX, CYLINDER, DETAIL_COLORS, sharedLambert } from './shared.ts';

/**
 * Reusable low-poly decorative details. Every piece is built from the shared
 * BOX/CYLINDER geometries and the shared Lambert material registry, is always
 * `noRaycast`, and is static — nothing here animates or hooks the frame loop.
 *
 * `<Detail level min>` gates a block of decoration on the current detail level
 * so callers can express the tier contract declaratively.
 */

export function Detail({
  level,
  min = 1,
  children,
}: {
  readonly level: DetailLevel;
  readonly min?: DetailLevel;
  readonly children: ReactNode;
}) {
  if (level < min) return null;
  return <>{children}</>;
}

type Xyz = readonly [number, number, number];

/** A framed window on a façade: frame slab + slightly inset glass pane. */
export function WindowDetail({
  position,
  width = 0.3,
  height = 0.34,
}: {
  readonly position: Xyz;
  readonly width?: number;
  readonly height?: number;
}) {
  return (
    <group position={position} raycast={noRaycast}>
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.frame)}
        scale={[width, height, 0.04]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.pane)}
        position={[0, 0, 0.03]}
        scale={[width - 0.08, height - 0.08, 0.03]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** A simple door slab with a step underneath. */
export function DoorDetail({
  position,
  width = 0.34,
  height = 0.62,
}: {
  readonly position: Xyz;
  readonly width?: number;
  readonly height?: number;
}) {
  return (
    <group position={position} raycast={noRaycast}>
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.door)}
        position={[0, height / 2, 0]}
        scale={[width, height, 0.05]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.stone)}
        position={[0, 0.03, 0.06]}
        scale={[width + 0.1, 0.06, 0.14]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** A flat trim band hugging the top edge of a wall (roof line accent). */
export function RoofTrim({ width, y }: { readonly width: number; readonly y: number }) {
  return (
    <mesh
      geometry={BOX}
      material={sharedLambert(DETAIL_COLORS.trim)}
      position={[0, y, 0]}
      scale={[width * 1.05, 0.07, width * 1.05]}
      raycast={noRaycast}
    />
  );
}

/** A sign board on a post — landmark wayfinding cue. */
export function SignDetail({
  position,
  color = DETAIL_COLORS.sign,
}: {
  readonly position: Xyz;
  readonly color?: string;
}) {
  return (
    <group position={position} raycast={noRaycast}>
      <mesh
        geometry={CYLINDER}
        material={sharedLambert(DETAIL_COLORS.signPost)}
        position={[0, 0.3, 0]}
        scale={[0.06, 0.6, 0.06]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(color)}
        position={[0, 0.68, 0]}
        scale={[0.42, 0.26, 0.05]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** Two-tone foliage clump used by planters, gardens and the keepsake tree. */
export function PlantCluster({
  position,
  scale = 1,
}: {
  readonly position: Xyz;
  readonly scale?: number;
}) {
  return (
    <group position={position} scale={scale} raycast={noRaycast}>
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.leaf)}
        position={[0, 0.09, 0]}
        scale={[0.22, 0.18, 0.22]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.leafDark)}
        position={[0.12, 0.07, 0.08]}
        scale={[0.16, 0.14, 0.16]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.leaf)}
        position={[-0.11, 0.06, -0.07]}
        scale={[0.13, 0.12, 0.13]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** A leaf clump with a blossom dot on top. */
export function FlowerPatch({
  position,
  scale = 1,
}: {
  readonly position: Xyz;
  readonly scale?: number;
}) {
  return (
    <group position={position} scale={scale} raycast={noRaycast}>
      <PlantCluster position={[0, 0, 0]} scale={0.8} />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.flower)}
        position={[0, 0.2, 0]}
        scale={[0.09, 0.09, 0.09]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.flower)}
        position={[0.14, 0.15, -0.1]}
        scale={[0.07, 0.07, 0.07]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** One to three small stones in a fixed arrangement. */
export function StoneCluster({
  position,
  scale = 1,
}: {
  readonly position: Xyz;
  readonly scale?: number;
}) {
  return (
    <group position={position} scale={scale} raycast={noRaycast}>
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.stone)}
        position={[0, 0.05, 0]}
        scale={[0.18, 0.1, 0.14]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.stone)}
        position={[0.16, 0.04, 0.1]}
        scale={[0.11, 0.08, 0.09]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** A short run of fence posts joined by a rail — garden/park edging. */
export function FenceRun({
  position,
  rotationY = 0,
  posts = 3,
  spacing = 0.4,
}: {
  readonly position: Xyz;
  readonly rotationY?: number;
  readonly posts?: number;
  readonly spacing?: number;
}) {
  const span = (posts - 1) * spacing;
  return (
    <group position={position} rotation={[0, rotationY, 0]} raycast={noRaycast}>
      {Array.from({ length: posts }, (_, i) => (
        <mesh
          key={i}
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.signPost)}
          position={[i * spacing - span / 2, 0.16, 0]}
          scale={[0.07, 0.32, 0.07]}
          raycast={noRaycast}
        />
      ))}
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.signPost)}
        position={[0, 0.26, 0]}
        scale={[span + 0.08, 0.05, 0.05]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** Striped awning slab over a shop front. */
export function AwningDetail({
  position,
  width = 1.0,
}: {
  readonly position: Xyz;
  readonly width?: number;
}) {
  return (
    <group position={position} raycast={noRaycast}>
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.awning)}
        rotation={[-0.35, 0, 0]}
        scale={[width, 0.05, 0.5]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert(DETAIL_COLORS.frame)}
        position={[0, -0.06, 0.2]}
        rotation={[-0.35, 0, 0]}
        scale={[width, 0.05, 0.08]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** Edge stones along a path segment between two points (visual only). */
export function PathEdgeStones({
  from,
  to,
  count = 4,
  offset = 0.55,
}: {
  readonly from: { readonly x: number; readonly z: number };
  readonly to: { readonly x: number; readonly z: number };
  readonly count?: number;
  readonly offset?: number;
}) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  // Normal to the path direction: stones sit on both sides of the corridor.
  const nx = (-dz / length) * offset;
  const nz = (dx / length) * offset;
  const stones: Xyz[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const side = i % 2 === 0 ? 1 : -1;
    stones.push([x + nx * side, 0.05, z + nz * side]);
  }
  return (
    <group raycast={noRaycast}>
      {stones.map((position, i) => (
        <mesh
          key={i}
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.stone)}
          position={position}
          scale={[0.14, 0.1, 0.14]}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}
