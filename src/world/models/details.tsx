import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { DetailLevel } from './modelProvider.ts';
import { noRaycast } from './raycast.ts';
import { ReactiveProp } from '../reactionBits.tsx';
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

export type Xyz = readonly [number, number, number];

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

/** A simple door slab with a step underneath. `reactive` gives the slab a
    hinge on its left edge: a tap swings it open a crack and lets it close —
    the child's knock answered by the building (docs/LIVING-WORLD.md). */
export function DoorDetail({
  position,
  width = 0.34,
  height = 0.62,
  reactive = false,
  subject = 'door',
}: {
  readonly position: Xyz;
  readonly width?: number;
  readonly height?: number;
  readonly reactive?: boolean;
  readonly subject?: string;
}) {
  const slab = (offsetX: number) => (
    <mesh
      geometry={BOX}
      material={sharedLambert(DETAIL_COLORS.door)}
      position={[offsetX, height / 2, 0]}
      scale={[width, height, 0.05]}
      raycast={noRaycast}
    />
  );
  return (
    <group position={position} raycast={noRaycast}>
      {reactive ? (
        <ReactiveProp
          reaction="door-swing"
          subject={subject}
          tapShape="panel"
          tapSize={[width + 0.3, height + 0.2]}
          radius={width}
          position={[-width / 2, 0, 0.02]}
          tapOffset={[width / 2, height / 2, 0.06]}
        >
          {slab(width / 2)}
        </ReactiveProp>
      ) : (
        slab(0)
      )}
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
  readonly scale?: number | undefined;
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
  readonly scale?: number | undefined;
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
  readonly scale?: number | undefined;
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
      {/* alternating awning stripes; four thin slabs share two materials */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          geometry={BOX}
          material={sharedLambert(i % 2 === 0 ? DETAIL_COLORS.awning : DETAIL_COLORS.frame)}
          position={[(i - 1.5) * (width / 4), 0, 0]}
          rotation={[-0.35, 0, 0]}
          scale={[width / 4, 0.05, 0.5]}
          raycast={noRaycast}
        />
      ))}
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

/**
 * Minimum distance a path stone keeps from either endpoint anchor, so stones
 * can never intrude into hotspot / destination-marker clearance.
 */
export const PATH_STONE_CLEARANCE = 1.2;

/**
 * Stone positions along a segment, excluding a fixed clear zone at each end.
 * Pure and exported so tests can assert clearance numerically.
 */
export function pathStonePositions(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
  count = 4,
  offset = 0.55,
  clearance = PATH_STONE_CLEARANCE,
): Xyz[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const usable = length - 2 * clearance;
  if (usable <= 0 || length === 0) return [];
  // Normal to the path direction: stones sit on both sides of the corridor.
  const nx = (-dz / length) * offset;
  const nz = (dx / length) * offset;
  const stones: Xyz[] = [];
  for (let i = 0; i < count; i++) {
    const along = clearance + (usable * (i + 1)) / (count + 1);
    const x = from.x + (dx / length) * along;
    const z = from.z + (dz / length) * along;
    const side = i % 2 === 1 ? 1 : -1;
    stones.push([x + nx * side, 0.05, z + nz * side]);
  }
  return stones;
}

interface RoadSlab {
  readonly x: number;
  readonly z: number;
  readonly angle: number;
}

/** Paved-slab centres along an edge — a cobbled lane a pre-reader can follow. */
function roadSlabs(
  edges: readonly {
    readonly from: { readonly x: number; readonly z: number };
    readonly to: { readonly x: number; readonly z: number };
  }[],
  spacing = 0.62,
): RoadSlab[] {
  const out: RoadSlab[] = [];
  for (const { from, to } of edges) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const n = Math.max(2, Math.floor(length / spacing));
    const angle = Math.atan2(dx, dz);
    for (let s = 0; s < n; s += 1) {
      const t = (s + 0.5) / n;
      // Alternate a tiny yaw so the lane reads as laid stones, not a ribbon.
      out.push({
        x: from.x + dx * t,
        z: from.z + dz * t,
        angle: angle + (s % 2 === 0 ? 0.1 : -0.1),
      });
    }
  }
  return out;
}

/** One instanced cobbled road across every path edge — a single draw call
    that marks the walkable network; PathEdgeStones remains the curb. */
export function StoneRoads({
  edges,
}: {
  readonly edges: readonly {
    readonly from: { readonly x: number; readonly z: number };
    readonly to: { readonly x: number; readonly z: number };
  }[];
}) {
  const slabs = useMemo(() => roadSlabs(edges), [edges]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(0.52, 0.07, 0.38);
    slabs.forEach((slab, i) => {
      pos.set(slab.x, 0.03, slab.z);
      quat.setFromAxisAngle(up, slab.angle);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [slabs]);
  return (
    <instancedMesh
      key={slabs.length}
      ref={ref}
      args={[BOX, sharedLambert('#cdbf9f'), slabs.length]}
      raycast={noRaycast}
    />
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
  return (
    <group raycast={noRaycast}>
      {pathStonePositions(from, to, count, offset).map((position, i) => (
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
