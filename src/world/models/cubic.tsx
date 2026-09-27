import { useMemo } from 'react';
import * as THREE from 'three';
import type { HeadwearId } from '../../domain/game/types.ts';
import type { FigureProps, LandmarkProps, PropProps } from './modelProvider.ts';
import { noRaycast } from './raycast.ts';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);

function useMaterial(color: string): THREE.MeshLambertMaterial {
  return useMemo(() => new THREE.MeshLambertMaterial({ color }), [color]);
}

const HEADWEAR_COLORS: Record<Exclude<HeadwearId, 'none'>, string> = {
  scarf: '#c96f8d',
  chador: '#44465e',
  kolah: '#8a5a33',
  kufi: '#efe6d2',
  beanie: '#5b8ab5',
};

/**
 * Cosmetic headwear layer. The head is a 0.42×0.38×0.38 box centred at
 * y ≈ 1.14 (+bob lift); every variant wraps it while leaving the face (+z)
 * open, and uses only the shared box/cylinder primitives — no extra
 * geometry, materials or per-frame work.
 */
function Headwear({ id, lift }: { readonly id: HeadwearId; readonly lift: number }) {
  const main = useMaterial(id === 'none' ? '#000000' : HEADWEAR_COLORS[id]);
  const accent = useMaterial(id === 'kufi' ? '#d9cba8' : '#e8eef4');
  if (id === 'none') return null;
  return (
    <group position={[0, lift, 0]} name={`headwear-${id}`}>
      {id === 'scarf' ? (
        <>
          {/* wrap: crown slab + side and back panels; the face stays open */}
          <mesh
            geometry={BOX}
            material={main}
            position={[0, 1.38, 0]}
            scale={[0.52, 0.14, 0.5]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={main}
            position={[-0.245, 1.2, -0.02]}
            scale={[0.07, 0.34, 0.42]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={main}
            position={[0.245, 1.2, -0.02]}
            scale={[0.07, 0.34, 0.42]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={main}
            position={[0, 1.2, -0.225]}
            scale={[0.52, 0.36, 0.09]}
            raycast={noRaycast}
          />
        </>
      ) : null}
      {id === 'chador' ? (
        <>
          {/* one continuous drape over head and body, open at the face */}
          <mesh
            geometry={BOX}
            material={main}
            position={[0, 1.4, -0.02]}
            scale={[0.54, 0.16, 0.52]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={main}
            position={[-0.3, 0.85, -0.03]}
            scale={[0.09, 1.0, 0.46]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={main}
            position={[0.3, 0.85, -0.03]}
            scale={[0.09, 1.0, 0.46]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={main}
            position={[0, 0.85, -0.27]}
            scale={[0.62, 1.05, 0.1]}
            raycast={noRaycast}
          />
        </>
      ) : null}
      {id === 'kolah' ? (
        <mesh
          geometry={CYLINDER}
          material={main}
          position={[0, 1.43, 0]}
          scale={[0.46, 0.2, 0.46]}
          raycast={noRaycast}
        />
      ) : null}
      {id === 'kufi' ? (
        <>
          <mesh
            geometry={CYLINDER}
            material={main}
            position={[0, 1.39, 0]}
            scale={[0.42, 0.12, 0.42]}
            raycast={noRaycast}
          />
          <mesh
            geometry={CYLINDER}
            material={accent}
            position={[0, 1.345, 0]}
            scale={[0.45, 0.06, 0.45]}
            raycast={noRaycast}
          />
        </>
      ) : null}
      {id === 'beanie' ? (
        <>
          <mesh
            geometry={CYLINDER}
            material={main}
            position={[0, 1.42, 0]}
            scale={[0.5, 0.18, 0.5]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={accent}
            position={[0, 1.56, 0]}
            scale={[0.16, 0.16, 0.16]}
            raycast={noRaycast}
          />
        </>
      ) : null}
    </group>
  );
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
export function CubicFigure({
  position,
  rotationY = 0,
  palette,
  bobbing = 0,
  label,
  headwear = 'none',
}: FigureProps) {
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
      <Headwear id={headwear} lift={lift} />
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
