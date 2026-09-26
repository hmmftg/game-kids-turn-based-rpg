import { useMemo } from 'react';
import * as THREE from 'three';
import type { FigureProps, LandmarkProps, PropProps } from './modelProvider.ts';
import { noRaycast } from './raycast.ts';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);

function useMaterial(color: string): THREE.MeshLambertMaterial {
  return useMemo(() => new THREE.MeshLambertMaterial({ color }), [color]);
}

/** Soft blob shadow: one transparent disc, no shadow maps anywhere in the scene. */
function BlobShadow({ radius = 0.5 }: { readonly radius?: number }) {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <circleGeometry args={[radius, 16]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.16} depthWrite={false} />
    </mesh>
  );
}

/**
 * A cubic character: body, head and two legs built from the shared box and
 * cylinder geometries. Both avatars use identical proportions and identical
 * mechanics; only the palette differs.
 */
export function CubicFigure({ position, rotationY = 0, palette, bobbing = 0, label }: FigureProps) {
  const body = useMaterial(palette.body);
  const head = useMaterial(palette.head);
  const limb = useMaterial(palette.limb);
  const lift = Math.sin(bobbing) * 0.05;

  return (
    <group position={[position.x, 0, position.z]} rotation={[0, rotationY, 0]} name={label ?? ''}>
      <BlobShadow radius={0.42} />
      <mesh
        geometry={CYLINDER}
        material={limb}
        position={[-0.16, 0.25, 0]}
        scale={[0.22, 0.5, 0.22]}
        raycast={noRaycast}
      />
      <mesh
        geometry={CYLINDER}
        material={limb}
        position={[0.16, 0.25, 0]}
        scale={[0.22, 0.5, 0.22]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={body}
        position={[0, 0.72 + lift, 0]}
        scale={[0.56, 0.46, 0.4]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={head}
        position={[0, 1.14 + lift, 0]}
        scale={[0.42, 0.38, 0.38]}
        raycast={noRaycast}
      />
    </group>
  );
}

export function CubicLandmark({ position, palette, height = 1.6, width = 1.4 }: LandmarkProps) {
  const base = useMaterial(palette.body);
  const roof = useMaterial(palette.head);
  return (
    <group position={[position.x, 0, position.z]}>
      <BlobShadow radius={width * 0.7} />
      <mesh
        geometry={BOX}
        material={base}
        position={[0, height / 2, 0]}
        scale={[width, height, width]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={roof}
        position={[0, height + 0.14, 0]}
        scale={[width * 1.16, 0.28, width * 1.16]}
        raycast={noRaycast}
      />
    </group>
  );
}

export function CubicProp({ position, palette, scale = 0.4, shape = 'box' }: PropProps) {
  const material = useMaterial(palette.body);
  return (
    <mesh
      geometry={shape === 'box' ? BOX : CYLINDER}
      material={material}
      position={[position.x, scale / 2, position.z]}
      scale={[scale, scale, scale]}
      raycast={noRaycast}
    />
  );
}
