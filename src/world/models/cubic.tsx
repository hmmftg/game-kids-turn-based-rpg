import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { HeadwearId } from '../../domain/game/types.ts';
import type {
  AnimalProps,
  AvatarHairStyle,
  DetailLevel,
  FigureProps,
  FigureVisualRole,
  LandmarkProps,
  PropProps,
  SceneryProps,
} from './modelProvider.ts';
import { noRaycast } from './raycast.ts';
import { prefersReducedMotion } from '../../services/device/capabilities.ts';
import {
  AwningDetail,
  Detail,
  DoorDetail,
  FenceRun,
  FlowerPatch,
  PlantCluster,
  RoofTrim,
  SignDetail,
  StoneCluster,
  WindowDetail,
  type Xyz,
} from './details.tsx';
import {
  BOX,
  CIRCLE,
  DETAIL_COLORS,
  SHADOW_MATERIAL,
  cylinderFor,
  roundedBoxFor,
  eyeFor,
  softBoxFor,
  drapeFor,
  sharedLambert,
  sphereFor,
} from './shared.ts';

// Materials come from the module-level registry so repeated details across the
// whole scene share one MeshLambertMaterial instance per color.
const useMaterial = sharedLambert;

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
function Headwear({
  id,
  lift,
  level,
}: {
  readonly id: HeadwearId;
  readonly lift: number;
  readonly level: DetailLevel;
}) {
  const main = useMaterial(id === 'none' ? '#000000' : HEADWEAR_COLORS[id]);
  const accent = useMaterial(id === 'kufi' ? '#d9cba8' : '#e8eef4');
  const cylinder = cylinderFor(level);
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
          geometry={cylinder}
          material={main}
          position={[0, 1.43, 0]}
          scale={[0.46, 0.2, 0.46]}
          raycast={noRaycast}
        />
      ) : null}
      {id === 'kufi' ? (
        <>
          <mesh
            geometry={cylinder}
            material={main}
            position={[0, 1.39, 0]}
            scale={[0.42, 0.12, 0.42]}
            raycast={noRaycast}
          />
          <mesh
            geometry={cylinder}
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
            geometry={cylinder}
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

/**
 * Real female covering at the very-high tier: a scarf or chador that drapes
 * the head AND shoulders like the real garment — crown cap, long side falls,
 * a deep back fall, and (chador only) a front chest band plus a darker hem
 * accent. The face stays open; shared BOX only. Renders instead of the
 * coarse `Headwear` shape at level 4 — same identity, more garment truth.
 */
function Covering({
  kind,
  lift,
  level,
  sway,
}: {
  readonly kind: 'scarf' | 'chador';
  readonly lift: number;
  readonly level: DetailLevel;
  readonly sway: number;
}) {
  const main = useMaterial(HEADWEAR_COLORS[kind]);
  // ONE draped mesh — an open cylinder segment that falls from the crown,
  // flares over the shoulders, and leaves the face exposed. The chador is
  // taller, wider, and wraps nearly all the way around (chest covered by
  // the same cloth); the scarf stops higher and opens wider at the front.
  // The crown sits right on the head (head top = 1.33): its closed cap
  // covers the head top and the rim overlaps it slightly — no air gap.
  // Chador falls to just above the ground (hem ~0.14); the scarf stops at
  // waist level. The whole garment rocks gently around the neck pivot while
  // the figure walks, settling still on arrival.
  const height = kind === 'chador' ? 1.2 : 0.68;
  const centerY = COVERING_CROWN_Y - height / 2;
  return (
    <Detail level={level} min={4}>
      <group position={[0, lift, 0]}>
        <group position={[0, COVERING_PIVOT_Y, 0]} rotation={[sway * 0.03, 0, sway * 0.05]}>
          <mesh
            geometry={drapeFor(kind, level)}
            material={main}
            position={[0, centerY - COVERING_PIVOT_Y, -0.03]}
            scale={[1.08, height, 0.82]}
            raycast={noRaycast}
          />
        </group>
      </group>
    </Detail>
  );
}

/** Soft blob shadow: one transparent disc, no shadow maps anywhere in the scene. */
export function BlobShadow({ radius = 0.5 }: { readonly radius?: number }) {
  return (
    <mesh
      position={[0, 0.02, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={CIRCLE}
      material={SHADOW_MATERIAL}
      scale={[radius, radius, 1]}
      raycast={noRaycast}
    />
  );
}

/**
 * Kid-avatar hair: a coarse silhouette in the avatar's own hair color so the
 * four presets are distinguishable at hub camera scale. Shared BOX geometry
 * only; medium+ tiers get the full silhouette, low keeps just the crown.
 * Skipped when headwear covers the head.
 */
function Hair({
  style,
  color,
  lift,
  level,
}: {
  readonly style: AvatarHairStyle;
  readonly color: string;
  readonly lift: number;
  readonly level: DetailLevel;
}) {
  const mat = useMaterial(color);
  return (
    <group name={`hair-${style}`}>
      {/* crown cap — every style */}
      <mesh
        geometry={BOX}
        material={mat}
        position={[0, 1.36 + lift, -0.02]}
        scale={[0.5, 0.14, 0.46]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        {style === 'pigtails' ? (
          <>
            <mesh
              geometry={BOX}
              material={mat}
              position={[-0.3, 1.22 + lift, -0.06]}
              scale={[0.14, 0.3, 0.22]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={mat}
              position={[0.3, 1.22 + lift, -0.06]}
              scale={[0.14, 0.3, 0.22]}
              raycast={noRaycast}
            />
          </>
        ) : null}
        {style === 'short' ? (
          <>
            {/* fringe + back panel, face stays open */}
            <mesh
              geometry={BOX}
              material={mat}
              position={[0, 1.3 + lift, 0.17]}
              scale={[0.44, 0.08, 0.06]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={mat}
              position={[0, 1.18 + lift, -0.225]}
              scale={[0.5, 0.3, 0.08]}
              raycast={noRaycast}
            />
          </>
        ) : null}
        {style === 'curly' ? (
          <>
            {/* puffy cap + two side tufts */}
            <mesh
              geometry={BOX}
              material={mat}
              position={[0, 1.45 + lift, -0.02]}
              scale={[0.44, 0.1, 0.4]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={mat}
              position={[-0.26, 1.3 + lift, -0.04]}
              scale={[0.12, 0.16, 0.3]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={mat}
              position={[0.26, 1.3 + lift, -0.04]}
              scale={[0.12, 0.16, 0.3]}
              raycast={noRaycast}
            />
          </>
        ) : null}
        {style === 'bun' ? (
          <>
            {/* gathered knot on top + back fall */}
            <mesh
              geometry={BOX}
              material={mat}
              position={[0, 1.5 + lift, -0.1]}
              scale={[0.2, 0.16, 0.2]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={mat}
              position={[0, 1.16 + lift, -0.225]}
              scale={[0.4, 0.34, 0.08]}
              raycast={noRaycast}
            />
          </>
        ) : null}
      </Detail>
    </group>
  );
}

/** Small static face: two eyes + a mouth on the head's +z side. */
function Face({ lift, level }: { readonly lift: number; readonly level: DetailLevel }) {
  // Round eyes at detail >=3 — same footprint, softer silhouette; the blink
  // still scales the `face-eye` meshes so liveliness is untouched.
  const eye = level >= 3 ? eyeFor() : BOX;
  return (
    <Detail level={level} min={1}>
      {/* `face-eye` names let the presentation-liveliness layer blink the
          eyes without touching the figure contract. */}
      <mesh
        name="face-eye"
        geometry={eye}
        material={sharedLambert('#33303a')}
        position={[-0.09, 1.2 + lift, 0.2]}
        scale={[0.05, 0.07, 0.02]}
        raycast={noRaycast}
      />
      <mesh
        name="face-eye"
        geometry={eye}
        material={sharedLambert('#33303a')}
        position={[0.09, 1.2 + lift, 0.2]}
        scale={[0.05, 0.07, 0.02]}
        raycast={noRaycast}
      />
      <Detail level={level} min={2}>
        <mesh
          geometry={BOX}
          material={sharedLambert('#b06a5a')}
          position={[0, 1.05 + lift, 0.2]}
          scale={[0.09, 0.03, 0.02]}
          raycast={noRaycast}
        />
        {/* cheek dots — tiny rounded pads, sit proud of the face plane */}
        <mesh
          geometry={BOX}
          material={sharedLambert('#e8a090')}
          position={[-0.14, 1.12 + lift, 0.195]}
          scale={[0.05, 0.04, 0.02]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#e8a090')}
          position={[0.14, 1.12 + lift, 0.195]}
          scale={[0.05, 0.04, 0.02]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* eyebrows — thin dark bars directly above each eye */}
        <mesh
          geometry={BOX}
          material={sharedLambert('#33303a')}
          position={[-0.09, 1.3 + lift, 0.2]}
          scale={[0.09, 0.02, 0.02]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#33303a')}
          position={[0.09, 1.3 + lift, 0.2]}
          scale={[0.09, 0.02, 0.02]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={4}>
        {/* eye glints — tiny light catch in the upper-inner eye corner */}
        <mesh
          geometry={BOX}
          material={sharedLambert('#f5f7fa')}
          position={[-0.075, 1.22 + lift, 0.205]}
          scale={[0.015, 0.02, 0.01]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#f5f7fa')}
          position={[0.105, 1.22 + lift, 0.205]}
          scale={[0.015, 0.02, 0.01]}
          raycast={noRaycast}
        />
      </Detail>
    </Detail>
  );
}

/**
 * Role accessories — static identity cues parented under the figure group so
 * walking and bobbing carry them automatically. No skeletal/cloth animation.
 */
function RoleDetails({
  role,
  lift,
  level,
}: {
  readonly role: FigureVisualRole;
  readonly lift: number;
  readonly level: DetailLevel;
}) {
  const cylinder = cylinderFor(level);
  switch (role) {
    case 'elder':
      return (
        <Detail level={level} min={1}>
          {/* cane */}
          <mesh
            geometry={cylinder}
            material={sharedLambert(DETAIL_COLORS.signPost)}
            position={[0.34, 0.45 + lift, 0.12]}
            scale={[0.05, 0.9, 0.05]}
            raycast={noRaycast}
          />
          <Detail level={level} min={2}>
            {/* beard */}
            <mesh
              geometry={BOX}
              material={sharedLambert('#e8eef4')}
              position={[0, 0.98 + lift, 0.2]}
              scale={[0.26, 0.16, 0.04]}
              raycast={noRaycast}
            />
          </Detail>
        </Detail>
      );
    case 'shopkeeper':
      return (
        <Detail level={level} min={1}>
          {/* apron */}
          <mesh
            geometry={BOX}
            material={sharedLambert('#e8eef4')}
            position={[0, 0.68 + lift, 0.21]}
            scale={[0.4, 0.34, 0.03]}
            raycast={noRaycast}
          />
          <Detail level={level} min={2}>
            {/* flat cap */}
            <mesh
              geometry={cylinder}
              material={sharedLambert(DETAIL_COLORS.door)}
              position={[0, 1.38 + lift, 0]}
              scale={[0.46, 0.07, 0.46]}
              raycast={noRaycast}
            />
          </Detail>
        </Detail>
      );
    case 'gardener':
      return (
        <Detail level={level} min={1}>
          {/* wide sun hat */}
          <mesh
            geometry={cylinder}
            material={sharedLambert('#d9cba8')}
            position={[0, 1.36 + lift, 0]}
            scale={[0.72, 0.05, 0.72]}
            raycast={noRaycast}
          />
          <mesh
            geometry={cylinder}
            material={sharedLambert('#d9cba8')}
            position={[0, 1.42 + lift, 0]}
            scale={[0.4, 0.1, 0.4]}
            raycast={noRaycast}
          />
          <Detail level={level} min={2}>
            {/* apron */}
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.leafDark)}
              position={[0, 0.66 + lift, 0.21]}
              scale={[0.36, 0.3, 0.03]}
              raycast={noRaycast}
            />
          </Detail>
        </Detail>
      );
    case 'neighbour':
      return (
        <Detail level={level} min={1}>
          {/* tote bag */}
          <mesh
            geometry={BOX}
            material={sharedLambert(DETAIL_COLORS.awning)}
            position={[0.33, 0.62 + lift, 0.05]}
            scale={[0.14, 0.22, 0.2]}
            raycast={noRaycast}
          />
        </Detail>
      );
    case 'friend':
      return (
        <Detail level={level} min={1}>
          {/* satchel strap + bag */}
          <mesh
            geometry={BOX}
            material={sharedLambert(DETAIL_COLORS.door)}
            position={[0, 0.72 + lift, 0.21]}
            rotation={[0, 0, 0.5]}
            scale={[0.5, 0.06, 0.03]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={sharedLambert(DETAIL_COLORS.door)}
            position={[-0.3, 0.55 + lift, 0.08]}
            scale={[0.16, 0.18, 0.16]}
            raycast={noRaycast}
          />
        </Detail>
      );
    case 'avatar':
      return (
        // The face lives inside `figure-head` so the glance turns it with
        // the head — body-level details stay on the body.
        <>
          <Detail level={level} min={2}>
            {/* shoes */}
            <mesh
              geometry={BOX}
              material={sharedLambert('#5a4632')}
              position={[-0.16, 0.04, 0.03]}
              scale={[0.24, 0.08, 0.3]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={sharedLambert('#5a4632')}
              position={[0.16, 0.04, 0.03]}
              scale={[0.24, 0.08, 0.3]}
              raycast={noRaycast}
            />
          </Detail>
        </>
      );
  }
}

/** Neck height the `figure-head` group pivots around (avatar glance). */
const HEAD_PIVOT_Y = 0.95;

/** Crown top of a scarf/chador: just over the head's top edge (1.33). */
const COVERING_CROWN_Y = 1.335;
/** Height the covering sways around — the neck, not the garment centre. */
const COVERING_PIVOT_Y = 1.28;

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
  moving = false,
  settle = 0,
  label,
  headwear = 'none',
  female = false,
  covering,
  hairStyle,
  hairColor = '#3a2a1c',
  detailLevel = 1,
  role,
}: FigureProps) {
  const body = useMaterial(palette.body);
  const head = useMaterial(palette.head);
  const limb = useMaterial(palette.limb);
  // Arrival settle: `settle` is a 1→0 decay envelope for ~0.8 s after the
  // last hop — lift and squash keep oscillating through it so the figure
  // eases into rest instead of snapping rigid mid-bounce.
  const bounce = moving ? 1 : settle;
  const lift = Math.sin(bobbing) * 0.05 * bounce;
  const squash = 1 + Math.sin(bobbing * 2) * 0.05 * bounce;
  // Walk-cycle sway: limbs stride and garments lag the walk while the
  // figure moves, and rest still on arrival — bounded, driven by the same
  // walk cycle (no loop of its own, nothing while idle, dropped under
  // reduced motion).
  const walkSway = moving && !prefersReducedMotion() ? Math.sin(bobbing) : 0;
  // Forward pitch into the stride: the upper body leans a few degrees into
  // the heading while walking, with a subtle per-step ripple — same bounded
  // driver, rest pose (lean = 0) identical to the upright figure.
  const walkLean = moving && !prefersReducedMotion() ? 0.07 + Math.sin(bobbing * 2) * 0.02 : 0;
  // Quality-tier geometry: level 0 resolves to the exact shared constants
  // (BOX / 12-seg CYLINDER) so low stays identical to the original look.
  const legGeometry = cylinderFor(detailLevel, detailLevel >= 2 ? 0.8 : 1);
  const soft = softBoxFor(detailLevel);
  const covered =
    covering !== undefined &&
    detailLevel >= 4 &&
    headwear !== 'kolah' &&
    headwear !== 'kufi' &&
    headwear !== 'beanie';
  // The torso stays the shared BOX at every tier: the tunic's angular slab
  // is intentional stylization, and rounding its corners would cost ~300
  // triangles per figure for a change barely visible at hub distance.

  return (
    <group
      position={[position.x, 0, position.z]}
      rotation={[0, rotationY, 0]}
      name={label ?? ''}
      dispose={null}
      scale={[1, squash, 1]}
    >
      <BlobShadow radius={0.42} />
      {/* legs stride at the hip in opposite phase while walking — the
          shoe caps / NPC shoes ride inside each swing group */}
      <group position={[-0.16, 0.5, 0]} rotation={[walkSway * 0.18, 0, 0]}>
        <mesh
          geometry={legGeometry}
          material={limb}
          position={[0, -0.25, 0]}
          scale={[0.22, 0.5, 0.22]}
          raycast={noRaycast}
        />
        <Detail level={detailLevel} min={4}>
          {/* shoe cap — darker tip grounded at the bottom of the leg */}
          <mesh
            geometry={soft}
            material={sharedLambert('#4a3f36')}
            position={[0, -0.45, 0.04]}
            scale={[0.22, 0.1, 0.26]}
            raycast={noRaycast}
          />
        </Detail>
        <Detail level={detailLevel} min={3}>
          {role !== 'avatar' ? (
            <mesh
              geometry={soft}
              material={sharedLambert('#5a4632')}
              position={[0, -0.46, 0.03]}
              scale={[0.24, 0.08, 0.3]}
              raycast={noRaycast}
            />
          ) : null}
        </Detail>
      </group>
      <group position={[0.16, 0.5, 0]} rotation={[-walkSway * 0.18, 0, 0]}>
        <mesh
          geometry={legGeometry}
          material={limb}
          position={[0, -0.25, 0]}
          scale={[0.22, 0.5, 0.22]}
          raycast={noRaycast}
        />
        <Detail level={detailLevel} min={4}>
          <mesh
            geometry={soft}
            material={sharedLambert('#4a3f36')}
            position={[0, -0.45, 0.04]}
            scale={[0.22, 0.1, 0.26]}
            raycast={noRaycast}
          />
        </Detail>
        <Detail level={detailLevel} min={3}>
          {role !== 'avatar' ? (
            <mesh
              geometry={soft}
              material={sharedLambert('#5a4632')}
              position={[0, -0.46, 0.03]}
              scale={[0.24, 0.08, 0.3]}
              raycast={noRaycast}
            />
          ) : null}
        </Detail>
      </group>
      {/* everything above the hips rides one lean group pivoting at the hip
          line — the inner offset keeps every child's authored height
          unchanged when walkLean = 0 */}
      <group position={[0, 0.5, 0]} rotation={[walkLean, 0, 0]}>
        <group position={[0, -0.5, 0]}>
          <mesh
            geometry={BOX}
            material={body}
            position={[0, 0.72 + lift, 0]}
            scale={[0.56, 0.46, 0.4]}
            raycast={noRaycast}
          />
          <Detail level={detailLevel} min={1}>
            {/* collar: thin garment band hugging the neck/torso join */}
            <mesh
              geometry={cylinderFor(detailLevel)}
              material={limb}
              position={[0, 0.95 + lift, 0]}
              scale={[0.3, 0.05, 0.24]}
              raycast={noRaycast}
            />
          </Detail>
          <Detail level={detailLevel} min={2}>
            {/* hem band along the bottom edge of the tunic */}
            <mesh
              geometry={BOX}
              material={limb}
              position={[0, 0.51 + lift, 0]}
              scale={[0.6, 0.06, 0.44]}
              raycast={noRaycast}
            />
          </Detail>
          <Detail level={detailLevel} min={3}>
            {/* arms angled slightly out from the shoulders, swinging opposite
            the same-side leg in stride; hands, finger hints and cuffs ride
            inside each shoulder swing group */}
            <group position={[-0.335, 0.88 + lift, 0]} rotation={[-walkSway * 0.15, 0, 0]}>
              <mesh
                geometry={soft}
                material={limb}
                position={[0, -0.16, 0]}
                rotation={[0, 0, 0.12]}
                scale={[0.09, 0.36, 0.13]}
                raycast={noRaycast}
              />
              <mesh
                geometry={BOX}
                material={head}
                position={[-0.04, -0.38, 0.02]}
                scale={[0.09, 0.08, 0.1]}
                raycast={noRaycast}
              />
              <mesh
                geometry={BOX}
                material={head}
                position={[-0.065, -0.44, 0.05]}
                scale={[0.022, 0.05, 0.03]}
                raycast={noRaycast}
              />
              <mesh
                geometry={BOX}
                material={head}
                position={[-0.015, -0.44, 0.05]}
                scale={[0.022, 0.05, 0.03]}
                raycast={noRaycast}
              />
              <Detail level={detailLevel} min={5}>
                {/* sleeve cuff at the wrist — cloth finishing, not decoration */}
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#e8eef4')}
                  position={[-0.04, -0.335, 0.02]}
                  scale={[0.1, 0.035, 0.11]}
                  raycast={noRaycast}
                />
              </Detail>
            </group>
            <group position={[0.335, 0.88 + lift, 0]} rotation={[walkSway * 0.15, 0, 0]}>
              <mesh
                geometry={soft}
                material={limb}
                position={[0, -0.16, 0]}
                rotation={[0, 0, -0.12]}
                scale={[0.09, 0.36, 0.13]}
                raycast={noRaycast}
              />
              <mesh
                geometry={BOX}
                material={head}
                position={[0.04, -0.38, 0.02]}
                scale={[0.09, 0.08, 0.1]}
                raycast={noRaycast}
              />
              <mesh
                geometry={BOX}
                material={head}
                position={[0.015, -0.44, 0.05]}
                scale={[0.022, 0.05, 0.03]}
                raycast={noRaycast}
              />
              <mesh
                geometry={BOX}
                material={head}
                position={[0.065, -0.44, 0.05]}
                scale={[0.022, 0.05, 0.03]}
                raycast={noRaycast}
              />
              <Detail level={detailLevel} min={5}>
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#e8eef4')}
                  position={[0.04, -0.335, 0.02]}
                  scale={[0.1, 0.035, 0.11]}
                  raycast={noRaycast}
                />
              </Detail>
            </group>
          </Detail>
          <Detail level={detailLevel} min={4}>
            {female ? (
              /* flared manteau skirt over the torso, in the figure's own outfit
             color — garment-following, not a floating cone; swings softly
             around the waist while walking */
              <group
                position={[0, 0.78 + lift, 0]}
                rotation={[walkSway * 0.05, 0, walkSway * 0.02]}
              >
                <mesh
                  geometry={cylinderFor(detailLevel, 0.8)}
                  material={limb}
                  position={[0, -0.22, 0]}
                  scale={[0.66, 0.46, 0.6]}
                  raycast={noRaycast}
                />
              </group>
            ) : (
              <>
                {/* real clothes: trousers swing at the hip in stride, belt,
                shirt placket + collar tips stay torso-bound */}
                <group position={[-0.16, 0.4, 0]} rotation={[walkSway * 0.14, 0, 0]}>
                  <mesh
                    geometry={soft}
                    material={limb}
                    position={[0, -0.18, 0]}
                    scale={[0.24, 0.34, 0.24]}
                    raycast={noRaycast}
                  />
                </group>
                <group position={[0.16, 0.4, 0]} rotation={[-walkSway * 0.14, 0, 0]}>
                  <mesh
                    geometry={soft}
                    material={limb}
                    position={[0, -0.18, 0]}
                    scale={[0.24, 0.34, 0.24]}
                    raycast={noRaycast}
                  />
                </group>
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#33303a')}
                  position={[0, 0.5 + lift, 0]}
                  scale={[0.58, 0.05, 0.42]}
                  raycast={noRaycast}
                />
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#e8eef4')}
                  position={[0, 0.76 + lift, 0.205]}
                  scale={[0.14, 0.26, 0.03]}
                  raycast={noRaycast}
                />
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#e8eef4')}
                  position={[-0.08, 0.93 + lift, 0.19]}
                  scale={[0.08, 0.04, 0.03]}
                  raycast={noRaycast}
                />
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#e8eef4')}
                  position={[0.08, 0.93 + lift, 0.19]}
                  scale={[0.08, 0.04, 0.03]}
                  raycast={noRaycast}
                />
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#33303a')}
                  position={[0, 0.8 + lift, 0.225]}
                  scale={[0.025, 0.025, 0.02]}
                  raycast={noRaycast}
                />
                <mesh
                  geometry={BOX}
                  material={sharedLambert('#33303a')}
                  position={[0, 0.7 + lift, 0.225]}
                  scale={[0.025, 0.025, 0.02]}
                  raycast={noRaycast}
                />
              </>
            )}
          </Detail>
          <Detail level={detailLevel} min={6}>
            {/* hem trim at the garment's bottom edge */}
            <mesh
              geometry={BOX}
              material={sharedLambert('#b23a48')}
              position={[0, (female ? 0.335 : 0.53) + lift, 0]}
              scale={female ? [0.68, 0.03, 0.62] : [0.58, 0.03, 0.42]}
              raycast={noRaycast}
            />
          </Detail>
          {/* The head pivots as one unit at the neck — the avatar's arrival
        glance turns this group, not the body. The inner offset group keeps
        every head part's authored absolute height unchanged. */}
          {/* the head counter-pitches about half the torso lean so the gaze
          stays near level instead of staring at the ground — the glance
          cue owns rotation.y and only fires while idle, so it is
          unaffected */}
          <group
            name="figure-head"
            position={[0, HEAD_PIVOT_Y, 0]}
            rotation={[-walkLean * 0.5, 0, 0]}
          >
            <group position={[0, -HEAD_PIVOT_Y, 0]}>
              {/* Rounded box, not a sphere: keeps the authored 0.42×0.38×0.38
            proportions and face plane while softening the cube silhouette. */}
              <mesh
                geometry={roundedBoxFor(detailLevel)}
                material={head}
                position={[0, 1.14 + lift, 0]}
                scale={[0.42, 0.38, 0.38]}
                raycast={noRaycast}
              />
              {role === 'avatar' || detailLevel >= 3 ? (
                <Face lift={lift} level={detailLevel} />
              ) : null}
              {covered ? (
                <Covering
                  kind={covering ?? 'chador'}
                  lift={lift}
                  level={detailLevel}
                  sway={walkSway}
                />
              ) : (
                <Headwear id={headwear} lift={lift} level={detailLevel} />
              )}
              {/* Covered heads skip hair entirely — the scarf/chador replaces
              the silhouette and nothing may poke through the cloth. */}
              {role === 'avatar' && headwear === 'none' && !covered && hairStyle ? (
                <Hair style={hairStyle} color={hairColor} lift={lift} level={detailLevel} />
              ) : null}
            </group>
          </group>
          {role !== undefined ? <RoleDetails role={role} lift={lift} level={detailLevel} /> : null}
        </group>
      </group>
    </group>
  );
}

const LANDMARK_FACE_Z = (width: number) => width / 2 + 0.01;

/**
 * Interaction clearance: landmarks sit at `anchor.z - 1.2` with their face
 * pointing toward the anchor, where the hotspot ring and avatar approach
 * point live. Decorative details must stay behind `LANDMARK_MAX_DETAIL_Z` in
 * local z so a fixed `LANDMARK_DETAIL_CLEARANCE` gap remains to the hotspot.
 */
export const LANDMARK_DETAIL_CLEARANCE = 0.45;
export const LANDMARK_MAX_DETAIL_Z = 1.2 - LANDMARK_DETAIL_CLEARANCE;
const capDetailZ = (z: number) => Math.min(z, LANDMARK_MAX_DETAIL_Z);

/** Flattened dome + finial — shared sphere at the level's tessellation. */
function DomeRoof({
  width,
  height,
  level,
}: {
  readonly width: number;
  readonly height: number;
  readonly level: DetailLevel;
}) {
  const sphere = sphereFor(level);
  return (
    <>
      <mesh
        geometry={sphere}
        material={sharedLambert(DETAIL_COLORS.dome)}
        position={[0, height + 0.3, 0]}
        scale={[width * 0.85, 0.55, width * 0.85]}
        raycast={noRaycast}
      />
      <mesh
        geometry={sphere}
        material={sharedLambert(DETAIL_COLORS.domeAccent)}
        position={[0, height + 0.62, 0]}
        scale={[0.14, 0.18, 0.14]}
        raycast={noRaycast}
      />
    </>
  );
}

/** Rounded arch cap over a door — half of a squashed sphere. */
function ArchCap({
  position,
  width = 0.34,
  level,
}: {
  readonly position: Xyz;
  readonly width?: number;
  readonly level: DetailLevel;
}) {
  return (
    <mesh
      geometry={sphereFor(level)}
      material={sharedLambert(DETAIL_COLORS.door)}
      position={position}
      scale={[width, 0.16, 0.05]}
      raycast={noRaycast}
    />
  );
}

/** home: door + windows + roof trim. */
function HomeGateDetails({ width, height, level }: VariantDetailProps) {
  const faceZ = LANDMARK_FACE_Z(width);
  return (
    <>
      <DoorDetail position={[0.15, 0, faceZ]} reactive subject="door-home-gate" />
      <Detail level={level} min={1}>
        <DomeRoof width={width} height={height} level={level} />
        <WindowDetail position={[-0.32, height * 0.55, faceZ]} />
      </Detail>
      <Detail level={level} min={2}>
        <ArchCap position={[0.15, 0.62, faceZ + 0.01]} level={level} />
      </Detail>
      <Detail level={level} min={2}>
        <WindowDetail position={[0.4, height * 0.55, faceZ]} />
        <RoofTrim width={width} y={height - 0.08} />
        {/* chimney */}
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.stone)}
          position={[width * 0.3, height + 0.34, -width * 0.22]}
          scale={[0.18, 0.42, 0.18]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

/** shop: awning + sign + display window; crate accent at high. */
function ShopDetails({ width, height, level }: VariantDetailProps) {
  const faceZ = LANDMARK_FACE_Z(width);
  return (
    <>
      <Detail level={level} min={1}>
        <AwningDetail position={[0, height * 0.62, capDetailZ(faceZ + 0.28)]} width={width * 0.9} />
        <WindowDetail position={[0, height * 0.38, faceZ]} width={0.5} height={0.42} />
      </Detail>
      <Detail level={level} min={2}>
        <SignDetail position={[width * 0.8, 0, capDetailZ(faceZ + 0.2)]} />
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.door)}
          position={[-width * 0.75, 0.14, capDetailZ(faceZ + 0.15)]}
          scale={[0.3, 0.28, 0.3]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

/** garden: planter rows + low fence + foliage. */
function GardenDetails({ width, level }: VariantDetailProps) {
  const faceZ = LANDMARK_FACE_Z(width);
  return (
    <>
      <Detail level={level} min={1}>
        <FenceRun position={[0, 0, capDetailZ(faceZ + 0.35)]} posts={4} spacing={width * 0.32} />
        <PlantCluster position={[-width * 0.35, 0, capDetailZ(faceZ + 0.15)]} />
        <PlantCluster position={[width * 0.3, 0, capDetailZ(faceZ + 0.12)]} />
      </Detail>
      <Detail level={level} min={2}>
        <FlowerPatch position={[0, 0, capDetailZ(faceZ + 0.18)]} />
        <PlantCluster position={[width * 0.05, 0, capDetailZ(faceZ + 0.35)]} scale={0.8} />
      </Detail>
    </>
  );
}

/** square (community): wide doorway + banner between two posts. */
function SquareDetails({ width, height, level }: VariantDetailProps) {
  const faceZ = LANDMARK_FACE_Z(width);
  return (
    <>
      <DoorDetail
        position={[0, 0, faceZ]}
        width={0.5}
        height={0.8}
        reactive
        subject="door-square"
      />
      <Detail level={level} min={1}>
        <DomeRoof width={width * 0.7} height={height} level={level} />
        {/* banner: two posts + cloth slab */}
        <mesh
          geometry={cylinderFor(level)}
          material={sharedLambert(DETAIL_COLORS.signPost)}
          position={[-width * 0.8, 0.5, capDetailZ(faceZ + 0.3)]}
          scale={[0.05, 1.0, 0.05]}
          raycast={noRaycast}
        />
        <mesh
          geometry={cylinderFor(level)}
          material={sharedLambert(DETAIL_COLORS.signPost)}
          position={[width * 0.8, 0.5, capDetailZ(faceZ + 0.3)]}
          scale={[0.05, 1.0, 0.05]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.awning)}
          position={[0, 0.92, capDetailZ(faceZ + 0.3)]}
          scale={[width * 1.6 - 0.1, 0.18, 0.03]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        <ArchCap position={[0, 0.8, faceZ + 0.01]} width={0.5} level={level} />
        <RoofTrim width={width} y={height - 0.08} />
      </Detail>
    </>
  );
}

/** fountain: basin ring + static water disc + center pillar. No animation. */
function FountainDetails({ level }: { readonly level: DetailLevel }) {
  const cylinder = cylinderFor(level);
  return (
    <>
      <mesh
        geometry={cylinder}
        material={sharedLambert(DETAIL_COLORS.stone)}
        position={[0, 0.16, 0]}
        scale={[1.6, 0.32, 1.6]}
        raycast={noRaycast}
      />
      <mesh
        geometry={cylinder}
        material={sharedLambert(DETAIL_COLORS.water)}
        position={[0, 0.33, 0]}
        scale={[1.3, 0.04, 1.3]}
        raycast={noRaycast}
      />
      <mesh
        geometry={cylinder}
        material={sharedLambert(DETAIL_COLORS.stone)}
        position={[0, 0.6, 0]}
        scale={[0.3, 0.6, 0.3]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={cylinder}
          material={sharedLambert(DETAIL_COLORS.water)}
          position={[0, 0.86, 0]}
          scale={[0.5, 0.06, 0.5]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        <StoneCluster position={[0.9, 0, 0.7]} />
        <PlantCluster position={[-0.85, 0, 0.75]} scale={0.8} />
      </Detail>
    </>
  );
}

interface VariantDetailProps {
  readonly width: number;
  readonly height: number;
  readonly level: DetailLevel;
}

/**
 * Cubic landmark: shared base box + roof slab, plus a per-variant detail layer
 * chosen by `variant`. The fountain variant replaces the building entirely —
 * it is scenery, not a house.
 */
export function CubicLandmark({
  position,
  palette,
  height = 1.6,
  width = 1.4,
  detailLevel = 1,
  variant,
}: LandmarkProps) {
  const base = useMaterial(palette.body);
  const roof = useMaterial(palette.head);
  if (variant === 'fountain') {
    return (
      <group position={[position.x, 0, position.z]} dispose={null}>
        <BlobShadow radius={1.0} />
        <FountainDetails level={detailLevel} />
      </group>
    );
  }
  return (
    <group position={[position.x, 0, position.z]} dispose={null}>
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
      {variant === 'home-gate' ? (
        <HomeGateDetails width={width} height={height} level={detailLevel} />
      ) : null}
      {variant === 'shop' ? (
        <ShopDetails width={width} height={height} level={detailLevel} />
      ) : null}
      {variant === 'garden' ? (
        <GardenDetails width={width} height={height} level={detailLevel} />
      ) : null}
      {variant === 'square' ? (
        <SquareDetails width={width} height={height} level={detailLevel} />
      ) : null}
    </group>
  );
}

/**
 * Recognizable props built from shared primitives. `variant` adds identity
 * details; the bare shape remains the low-tier silhouette.
 */
export function CubicProp({
  position,
  palette,
  scale = 0.4,
  shape = 'box',
  detailLevel = 1,
  variant,
}: PropProps) {
  const material = useMaterial(palette.body);
  return (
    <group position={[position.x, 0, position.z]} dispose={null}>
      {variant === 'ball' || variant === 'shell' ? (
        <mesh
          geometry={sphereFor(detailLevel)}
          material={material}
          position={[0, scale / 2, 0]}
          scale={variant === 'shell' ? [scale, scale * 0.65, scale * 0.9] : [scale, scale, scale]}
          raycast={noRaycast}
        />
      ) : variant === 'kite' ? null : (
        <mesh
          geometry={shape === 'box' ? BOX : cylinderFor(detailLevel)}
          material={material}
          position={[0, scale / 2, 0]}
          scale={[scale, scale, scale]}
          raycast={noRaycast}
        />
      )}
      <Detail level={detailLevel} min={1}>
        {variant === 'basket' ? (
          <>
            {/* rim + handle */}
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.door)}
              position={[0, scale + 0.02, 0]}
              scale={[scale * 1.08, 0.05, scale * 1.08]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.door)}
              position={[0, scale + 0.16, 0]}
              scale={[0.05, 0.26, 0.05]}
              raycast={noRaycast}
            />
          </>
        ) : null}
        {variant === 'crate' ? (
          <>
            {/* lid + strap */}
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.door)}
              position={[0, scale + 0.02, 0]}
              scale={[scale * 1.04, 0.06, scale * 1.04]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.signPost)}
              position={[0, scale / 2, 0]}
              scale={[scale * 0.16, scale * 1.02, scale * 1.02]}
              raycast={noRaycast}
            />
          </>
        ) : null}
        {variant === 'planter' ? (
          <>
            {/* soil + plant */}
            <mesh
              geometry={cylinderFor(detailLevel)}
              material={sharedLambert(DETAIL_COLORS.soil)}
              position={[0, scale + 0.01, 0]}
              scale={[scale * 0.85, 0.04, scale * 0.85]}
              raycast={noRaycast}
            />
            <PlantCluster position={[0, scale, 0]} scale={0.9} />
          </>
        ) : null}
        {variant === 'shell' ? (
          <>
            {/* ridge stripe — reads as a spiral shell, not a pebble */}
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.sign)}
              position={[0, scale * 0.72, 0]}
              rotation={[0, 0, 0.4]}
              scale={[scale * 0.2, scale * 0.5, scale * 0.9]}
              raycast={noRaycast}
            />
          </>
        ) : null}
        {variant === 'kite' ? (
          <>
            {/* propped diamond: the returned kite leans on its stick */}
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.signPost)}
              position={[0, scale * 0.8, 0]}
              rotation={[0, 0, -0.25]}
              scale={[0.04, scale * 1.7, 0.04]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={material}
              position={[0.1, scale * 1.5, 0]}
              rotation={[0, 0, Math.PI / 4]}
              scale={[scale * 0.9, scale * 0.9, 0.05]}
              raycast={noRaycast}
            />
            {/* tail bows down the trailing edge */}
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.flower)}
              position={[0.06, scale * 0.95, 0]}
              rotation={[0, 0, Math.PI / 4]}
              scale={[scale * 0.18, scale * 0.18, 0.03]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={sharedLambert(DETAIL_COLORS.flower)}
              position={[0.02, scale * 0.62, 0]}
              rotation={[0, 0, Math.PI / 4]}
              scale={[scale * 0.16, scale * 0.16, 0.03]}
              raycast={noRaycast}
            />
          </>
        ) : null}
      </Detail>
      <Detail level={detailLevel} min={2}>
        {variant === 'crate' ? (
          <mesh
            geometry={BOX}
            material={sharedLambert(DETAIL_COLORS.sign)}
            position={[0, scale * 0.55, scale * 0.52]}
            scale={[scale * 0.5, scale * 0.28, 0.02]}
            raycast={noRaycast}
          />
        ) : null}
        {variant === 'basket' ? <FlowerPatch position={[0, scale * 0.6, 0]} scale={0.55} /> : null}
      </Detail>
    </group>
  );
}

/**
 * Ambient animals — toy silhouettes built from shared primitives only.
 * Position/heading are applied by the parent group (useCritters drives it);
 * `moving` is the only pose prop: wings spread vs folded, legs stretched vs
 * tucked, tail raised vs curled. Mesh counts follow the tier budget:
 * detailLevel 0 → a single silhouette mesh, 1 → 2–3 meshes, 2 → 3–4 meshes,
 * keeping the whole animal cast under ~28 draw calls on high.
 */

interface SpeciesProps {
  readonly tint: string | undefined;
  readonly moving: boolean;
  readonly level: DetailLevel;
}

/** ~the dash-bob cadence in useCritters (phase += step * 10). */
const GAIT_SPEED = 9;

/**
 * Per-part stride/flap motion while a critter moves, plus a short settle
 * flourish on the moving→idle transition. Animatable parts live in a single
 * group named `gait-<kind>` carrying the authored pose; the gait root itself
 * mounts only while `moving` or during the ~1.4 s settle, so idle critters
 * add no objects at all. Each activation traverses the fresh root, captures
 * the authored pose as the base, and oscillates around it, so `moving` pose
 * switches always win and the written axis composes with the authored one.
 * The settle phase is the same oscillation under an exp(-3t) envelope — a
 * tail flick, wing rustle, or swish that dies out — then `onSettled` unmounts
 * the root and joints snap back to their authored idle pose. Nothing else
 * writes those rotations, and under reduced motion none of this activates.
 * Same bounded, presentation-only contract as the figure's walkSway. Frames
 * already flow while a critter moves; invalidate() keeps it true through the
 * settle as well.
 */
const SETTLE_SECONDS = 1.4;

function useCritterGait(
  rootRef: React.RefObject<THREE.Group | null>,
  moving: boolean,
  onSettled: () => void,
) {
  const lastRoot = useRef<THREE.Group | null>(null);
  const joints = useRef<THREE.Object3D[]>([]);
  const bases = useRef<THREE.Euler[]>([]);
  const mode = useRef<'gait' | 'settle' | null>(null);
  const settleStart = useRef(0);
  const settleDone = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  useFrame((state) => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    if (root !== lastRoot.current) {
      lastRoot.current = root;
      mode.current = null;
      joints.current = [];
    }
    // Re-collect when the subtree changed under us: a Suspense fallback's
    // joints go stale when the real species resolves, and a subtree that
    // mounted joint-less may gain joints afterwards.
    if (joints.current.length === 0 || joints.current.some((j) => j.parent === null)) {
      joints.current = [];
      root.traverse((obj) => {
        if (obj.name.startsWith('gait-')) joints.current.push(obj);
      });
      bases.current = joints.current.map((joint) => joint.rotation.clone());
    }
    const now = state.clock.elapsedTime;
    const next = moving ? 'gait' : 'settle';
    if (mode.current !== next) {
      mode.current = next;
      // React has already applied this burst's authored pose by now.
      bases.current = joints.current.map((joint) => joint.rotation.clone());
      settleStart.current = now;
      settleDone.current = false;
    }
    let damp = 1;
    if (!moving) {
      const t = now - settleStart.current;
      if (t > SETTLE_SECONDS) {
        joints.current.forEach((joint, i) => joint.rotation.copy(bases.current[i]!));
        if (!settleDone.current) {
          settleDone.current = true;
          onSettled();
        }
        return;
      }
      damp = Math.exp(-3 * t);
    }
    const s = Math.sin(now * GAIT_SPEED) * damp;
    const flutter = Math.sin(now * GAIT_SPEED * 1.8) * damp;
    joints.current.forEach((joint, i) => {
      const base = bases.current[i]!;
      switch (joint.name.slice(5)) {
        case 'a':
          joint.rotation.x = base.x + s * 0.5;
          break;
        case 'b':
          joint.rotation.x = base.x - s * 0.5;
          break;
        case 'flap-l':
          joint.rotation.z = base.z + s * 0.35;
          break;
        case 'flap-r':
          joint.rotation.z = base.z - s * 0.35;
          break;
        case 'swish':
          joint.rotation.y = base.y + s * 0.45;
          break;
        case 'tail':
          joint.rotation.z = base.z + s * 0.18;
          break;
        case 'waddle':
          joint.rotation.z = base.z + s * 0.12;
          break;
        case 'flutter-l':
          joint.rotation.z = base.z + flutter * 0.5;
          break;
        case 'flutter-r':
          joint.rotation.z = base.z - flutter * 0.5;
          break;
      }
    });
    invalidate();
  });
}

function CatMesh({ tint, moving, level }: SpeciesProps) {
  const fur = useMaterial(tint ?? '#d98a4a');
  const sphere = sphereFor(level);
  const soft = softBoxFor(level);
  const eye = eyeFor();
  return (
    <>
      {/* body: squashed sphere; sits upright when idle, stretched forward when running */}
      <mesh
        geometry={sphere}
        material={fur}
        position={[0, moving ? 0.26 : 0.3, 0]}
        rotation={[moving ? -0.25 : 0.35, 0, 0]}
        scale={[0.42, moving ? 0.36 : 0.5, 0.55]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={sphere}
          material={fur}
          position={[0, 0.58, 0.22]}
          scale={[0.3, 0.28, 0.28]}
          raycast={noRaycast}
        />
        {/* tail: raised when running, curled low when sitting; sways
            gently on the `gait-tail` joint while moving */}
        <group
          name="gait-tail"
          position={[0, moving ? 0.5 : 0.3, -0.38]}
          rotation={[moving ? -0.4 : 0.6, 0, 0]}
        >
          <mesh geometry={soft} material={fur} scale={[0.07, 0.5, 0.07]} raycast={noRaycast} />
        </group>
        {/* muzzle pad on the face side of the head */}
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, 0.53, 0.42]}
          scale={[0.14, 0.09, 0.08]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        {/* two ear tips on top of the head */}
        <mesh
          geometry={soft}
          material={fur}
          position={[-0.09, 0.76, 0.2]}
          rotation={[0, 0, 0.15]}
          scale={[0.1, 0.12, 0.05]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={fur}
          position={[0.09, 0.76, 0.2]}
          rotation={[0, 0, -0.15]}
          scale={[0.1, 0.12, 0.05]}
          raycast={noRaycast}
        />
        {/* ear strip across the top of the head */}
        <mesh
          geometry={soft}
          material={fur}
          position={[0, 0.8, 0.2]}
          scale={[0.3, 0.12, 0.06]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* four legs with lighter paw tips — a full body, not a floating blob;
            diagonal pairs trot on gait joints while moving */}
        <group name="gait-a" position={[-0.12, 0.19, 0.18]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.08, 0]}
            scale={[0.07, 0.16, 0.08]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-b" position={[0.12, 0.19, 0.18]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.08, 0]}
            scale={[0.07, 0.16, 0.08]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-b" position={[-0.13, 0.19, -0.18]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.08, 0]}
            scale={[0.08, 0.16, 0.09]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-a" position={[0.13, 0.19, -0.18]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.08, 0]}
            scale={[0.08, 0.16, 0.09]}
            raycast={noRaycast}
          />
        </group>
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[-0.12, 0.035, 0.19]}
          scale={[0.07, 0.05, 0.09]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0.12, 0.035, 0.19]}
          scale={[0.07, 0.05, 0.09]}
          raycast={noRaycast}
        />
        {/* forehead tabby stripes — same sign-color accent as the muzzle */}
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[-0.07, 0.72, 0.28]}
          rotation={[0.3, 0, 0.1]}
          scale={[0.04, 0.1, 0.02]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0.07, 0.72, 0.28]}
          rotation={[0.3, 0, -0.1]}
          scale={[0.04, 0.1, 0.02]}
          raycast={noRaycast}
        />
        {/* round dark eyes — the lovable face */}
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[-0.08, 0.62, 0.44]}
          scale={[0.05, 0.05, 0.03]}
          raycast={noRaycast}
        />
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0.08, 0.62, 0.44]}
          scale={[0.05, 0.05, 0.03]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={4}>
        {/* inner-ear pads + a darker tail tip */}
        <mesh
          geometry={BOX}
          material={sharedLambert('#e8a090')}
          position={[-0.09, 0.77, 0.23]}
          rotation={[0, 0, 0.15]}
          scale={[0.05, 0.07, 0.02]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#e8a090')}
          position={[0.09, 0.77, 0.23]}
          rotation={[0, 0, -0.15]}
          scale={[0.05, 0.07, 0.02]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, moving ? 0.62 : 0.48, -0.5]}
          rotation={[moving ? -0.4 : 0.6, 0, 0]}
          scale={[0.08, 0.1, 0.08]}
          raycast={noRaycast}
        />
        {/* cheek fluff + a mid-tail joint: fur, not smooth plastic */}
        <mesh
          geometry={BOX}
          material={fur}
          position={[-0.13, 0.52, 0.34]}
          rotation={[0, 0, 0.5]}
          scale={[0.05, 0.03, 0.05]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={fur}
          position={[0.13, 0.52, 0.34]}
          rotation={[0, 0, -0.5]}
          scale={[0.05, 0.03, 0.05]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={fur}
          position={[0, 0.34, -0.42]}
          rotation={[0.5, 0, 0]}
          scale={[0.07, 0.22, 0.07]}
          raycast={noRaycast}
        />
        {/* whiskers + a collar: the neighbourhood cat reads cared-for */}
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[-0.14, 0.55, 0.44]}
          rotation={[0, 0.3, 0]}
          scale={[0.12, 0.012, 0.012]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0.14, 0.55, 0.44]}
          rotation={[0, -0.3, 0]}
          scale={[0.12, 0.012, 0.012]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#b23a48')}
          position={[0, 0.45, 0.3]}
          scale={[0.22, 0.04, 0.14]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={5}>
        {/* chest fur patch + darker saddle — a real tabby coat */}
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, 0.3, 0.24]}
          scale={[0.16, 0.14, 0.03]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, 0.34, -0.05]}
          scale={[0.1, 0.02, 0.3]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={6}>
        {/* lynx-style ear tufts */}
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[-0.11, 0.74, 0.24]}
          rotation={[0, 0, 0.3]}
          scale={[0.02, 0.06, 0.02]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0.11, 0.74, 0.24]}
          rotation={[0, 0, -0.3]}
          scale={[0.02, 0.06, 0.02]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

/** River-bank duck: plump low body, flat bill, webbed feet on waddle joints. */
function DuckMesh({ tint, moving, level }: SpeciesProps) {
  const feather = useMaterial(tint ?? '#f2efe2');
  const bill = useMaterial(DETAIL_COLORS.beak);
  const sphere = sphereFor(level);
  const soft = softBoxFor(level);
  const eye = eyeFor();
  return (
    <>
      {/* plump body: sits tall when idle, stretches forward when waddling */}
      <mesh
        geometry={sphere}
        material={feather}
        position={[0, moving ? 0.3 : 0.34, 0]}
        rotation={[moving ? -0.15 : 0.25, 0, 0]}
        scale={[0.36, 0.38, 0.5]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        {/* head rides a short neck on the front of the body */}
        <mesh
          geometry={sphere}
          material={feather}
          position={[0, 0.62, 0.24]}
          scale={[0.22, 0.22, 0.22]}
          raycast={noRaycast}
        />
        <mesh
          geometry={sphere}
          material={feather}
          position={[0, 0.46, 0.16]}
          scale={[0.14, 0.2, 0.14]}
          raycast={noRaycast}
        />
        {/* flat wide bill — the unmistakable duck read */}
        <mesh
          geometry={soft}
          material={bill}
          position={[0, 0.58, 0.44]}
          scale={[0.18, 0.05, 0.16]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        {/* upright tail feathers */}
        <mesh
          geometry={soft}
          material={feather}
          position={[0, moving ? 0.34 : 0.46, -0.42]}
          rotation={[moving ? -0.2 : -0.55, 0, 0]}
          scale={[0.12, 0.18, 0.06]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* webbed feet — diagonal waddle on gait joints while moving */}
        <group name="gait-a" position={[-0.12, 0.1, 0.04]}>
          <mesh
            geometry={soft}
            material={bill}
            position={[0, -0.04, 0.04]}
            scale={[0.11, 0.05, 0.17]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-b" position={[0.12, 0.1, 0.04]}>
          <mesh
            geometry={soft}
            material={bill}
            position={[0, -0.04, 0.04]}
            scale={[0.11, 0.05, 0.17]}
            raycast={noRaycast}
          />
        </group>
        {/* round dark eyes */}
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[-0.08, 0.66, 0.4]}
          scale={[0.04, 0.04, 0.025]}
          raycast={noRaycast}
        />
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0.08, 0.66, 0.4]}
          scale={[0.04, 0.04, 0.025]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={4}>
        {/* folded wing panels on each flank */}
        <mesh
          geometry={soft}
          material={feather}
          position={[-0.32, 0.36, -0.02]}
          rotation={[0, 0, 0.35]}
          scale={[0.08, 0.2, 0.34]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={feather}
          position={[0.32, 0.36, -0.02]}
          rotation={[0, 0, -0.35]}
          scale={[0.08, 0.2, 0.34]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

/** Village dog: boxy friendly body, floppy ears, wagging tail joint. */
function DogMesh({ tint, moving, level }: SpeciesProps) {
  const fur = useMaterial(tint ?? '#b98a52');
  const soft = softBoxFor(level);
  const eye = eyeFor();
  return (
    <>
      {/* body: chest-deep box, lowers and stretches when trotting */}
      <mesh
        geometry={soft}
        material={fur}
        position={[0, moving ? 0.34 : 0.38, 0]}
        scale={[0.4, moving ? 0.36 : 0.42, 0.66]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        {/* head + short muzzle with a dark nose */}
        <mesh
          geometry={soft}
          material={fur}
          position={[0, 0.64, 0.34]}
          scale={[0.32, 0.3, 0.3]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={fur}
          position={[0, 0.58, 0.52]}
          scale={[0.16, 0.13, 0.14]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0, 0.6, 0.6]}
          scale={[0.07, 0.05, 0.05]}
          raycast={noRaycast}
        />
        {/* tail wags on the gait-tail joint while moving */}
        <group
          name="gait-tail"
          position={[0, moving ? 0.52 : 0.46, -0.36]}
          rotation={[moving ? -0.7 : 0.7, 0, 0]}
        >
          <mesh
            geometry={soft}
            material={fur}
            position={[0, 0.1, -0.04]}
            scale={[0.08, 0.24, 0.08]}
            raycast={noRaycast}
          />
        </group>
      </Detail>
      <Detail level={level} min={2}>
        {/* floppy ears hanging off the head sides */}
        <mesh
          geometry={soft}
          material={fur}
          position={[-0.18, 0.62, 0.32]}
          rotation={[0.2, 0, 0.25]}
          scale={[0.07, 0.2, 0.12]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={fur}
          position={[0.18, 0.62, 0.32]}
          rotation={[0.2, 0, -0.25]}
          scale={[0.07, 0.2, 0.12]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* four legs — diagonal pairs trot on gait joints while moving */}
        <group name="gait-a" position={[-0.14, 0.2, 0.22]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.1, 0]}
            scale={[0.08, 0.2, 0.09]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-b" position={[0.14, 0.2, 0.22]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.1, 0]}
            scale={[0.08, 0.2, 0.09]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-b" position={[-0.14, 0.2, -0.22]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.1, 0]}
            scale={[0.08, 0.2, 0.09]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-a" position={[0.14, 0.2, -0.22]}>
          <mesh
            geometry={soft}
            material={fur}
            position={[0, -0.1, 0]}
            scale={[0.08, 0.2, 0.09]}
            raycast={noRaycast}
          />
        </group>
        {/* round dark eyes */}
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[-0.09, 0.7, 0.48]}
          scale={[0.045, 0.045, 0.03]}
          raycast={noRaycast}
        />
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0.09, 0.7, 0.48]}
          scale={[0.045, 0.045, 0.03]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={4}>
        {/* red collar + a lighter chest patch — a cared-for village dog */}
        <mesh
          geometry={soft}
          material={sharedLambert('#b23a48')}
          position={[0, 0.52, 0.36]}
          scale={[0.26, 0.05, 0.18]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, 0.32, 0.3]}
          scale={[0.18, 0.18, 0.04]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

/**
 * Park elephant: broad barrel body, oversized ears, a hanging trunk — the
 * biggest critter (~1.5 long), still small enough to read as a friendly
 * park resident next to the child avatar. The trunk sways on `gait-swish`
 * and four column legs stride on `gait-a`/`gait-b` while ambling.
 */
function ElephantMesh({ tint, moving, level }: SpeciesProps) {
  const hide = useMaterial(tint ?? '#a9a29a');
  const soft = softBoxFor(level);
  const eye = eyeFor();
  return (
    <>
      {/* barrel body — settles a touch lower while ambling */}
      <mesh
        geometry={soft}
        material={hide}
        position={[0, moving ? 0.52 : 0.58, 0]}
        scale={[0.56, 0.56, 0.95]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        {/* big head on the front of the body */}
        <mesh
          geometry={soft}
          material={hide}
          position={[0, 0.72, 0.5]}
          scale={[0.42, 0.4, 0.36]}
          raycast={noRaycast}
        />
        {/* trunk hangs from the head's lower edge — sways on gait-swish */}
        <group name="gait-swish" position={[0, 0.62, 0.66]}>
          <mesh
            geometry={soft}
            material={hide}
            position={[0, -0.22, 0.02]}
            rotation={[0.12, 0, 0]}
            scale={[0.13, 0.44, 0.13]}
            raycast={noRaycast}
          />
        </group>
        {/* short tail flicks on gait-tail while moving */}
        <group name="gait-tail" position={[0, 0.62, -0.5]} rotation={[0.5, 0, 0]}>
          <mesh
            geometry={soft}
            material={hide}
            position={[0, -0.14, -0.02]}
            scale={[0.07, 0.3, 0.07]}
            raycast={noRaycast}
          />
        </group>
      </Detail>
      <Detail level={level} min={2}>
        {/* oversized flat ears — the unmistakable elephant read */}
        <mesh
          geometry={soft}
          material={hide}
          position={[-0.24, 0.74, 0.46]}
          rotation={[0, 0, 0.18]}
          scale={[0.07, 0.34, 0.28]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={hide}
          position={[0.24, 0.74, 0.46]}
          rotation={[0, 0, -0.18]}
          scale={[0.07, 0.34, 0.28]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* four column legs — diagonal pairs stride while ambling */}
        <group name="gait-a" position={[-0.18, 0.28, 0.28]}>
          <mesh
            geometry={soft}
            material={hide}
            position={[0, -0.14, 0]}
            scale={[0.14, 0.3, 0.16]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-b" position={[0.18, 0.28, 0.28]}>
          <mesh
            geometry={soft}
            material={hide}
            position={[0, -0.14, 0]}
            scale={[0.14, 0.3, 0.16]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-b" position={[-0.18, 0.28, -0.28]}>
          <mesh
            geometry={soft}
            material={hide}
            position={[0, -0.14, 0]}
            scale={[0.14, 0.3, 0.16]}
            raycast={noRaycast}
          />
        </group>
        <group name="gait-a" position={[0.18, 0.28, -0.28]}>
          <mesh
            geometry={soft}
            material={hide}
            position={[0, -0.14, 0]}
            scale={[0.14, 0.3, 0.16]}
            raycast={noRaycast}
          />
        </group>
        {/* round dark eyes on the head's front corners */}
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[-0.13, 0.78, 0.66]}
          scale={[0.045, 0.045, 0.03]}
          raycast={noRaycast}
        />
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0.13, 0.78, 0.66]}
          scale={[0.045, 0.045, 0.03]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={4}>
        {/* short cream tusks beside the trunk */}
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[-0.12, 0.52, 0.64]}
          rotation={[0.35, 0, 0]}
          scale={[0.05, 0.05, 0.16]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0.12, 0.52, 0.64]}
          rotation={[0.35, 0, 0]}
          scale={[0.05, 0.05, 0.16]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

function BirdMesh({ tint, moving, level }: SpeciesProps) {
  const feathers = useMaterial(tint ?? '#5b8ab5');
  const beak = useMaterial(DETAIL_COLORS.beak);
  const sphere = sphereFor(level);
  const soft = softBoxFor(level);
  const eye = eyeFor();
  return (
    <>
      <mesh
        geometry={sphere}
        material={feathers}
        position={[0, 0.22, 0]}
        rotation={[0.3, 0, 0]}
        scale={[0.26, 0.28, 0.34]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={sphere}
          material={feathers}
          position={[0, 0.4, 0.16]}
          scale={[0.2, 0.2, 0.2]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={beak}
          position={[0, 0.4, 0.3]}
          scale={[0.06, 0.05, 0.1]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* round dark eyes */}
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[-0.07, 0.44, 0.3]}
          scale={[0.04, 0.04, 0.025]}
          raycast={noRaycast}
        />
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0.07, 0.44, 0.3]}
          scale={[0.04, 0.04, 0.025]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        {/* tail fan */}
        <mesh
          geometry={BOX}
          material={feathers}
          position={[0, 0.2, -0.28]}
          rotation={[0.5, 0, 0]}
          scale={[0.14, 0.02, 0.22]}
          raycast={noRaycast}
        />
        {/* wing band: a wide flat slab — spread while flying, folded back
            when perched; flaps on the `gait-flap-l` joint while moving */}
        <group
          name="gait-flap-l"
          position={[0, moving ? 0.3 : 0.26, moving ? 0 : -0.1]}
          rotation={[moving ? 0 : -0.5, 0, 0]}
        >
          <mesh
            geometry={BOX}
            material={feathers}
            scale={[moving ? 0.72 : 0.3, 0.03, moving ? 0.2 : 0.3]}
            raycast={noRaycast}
          />
        </group>
      </Detail>
      <Detail level={level} min={3}>
        {/* two perching feet */}
        <mesh
          geometry={BOX}
          material={beak}
          position={[-0.06, 0.04, 0.02]}
          scale={[0.04, 0.08, 0.08]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={beak}
          position={[0.06, 0.04, 0.02]}
          scale={[0.04, 0.08, 0.08]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={5}>
        {/* layered tail feathers fanning out behind */}
        <mesh
          geometry={BOX}
          material={feathers}
          position={[0, 0.18, -0.3]}
          rotation={[-0.5, 0, 0]}
          scale={[0.14, 0.02, 0.16]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={feathers}
          position={[0, 0.22, -0.26]}
          rotation={[-0.7, 0, 0]}
          scale={[0.12, 0.02, 0.12]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={6}>
        {/* small head crest */}
        <mesh
          geometry={BOX}
          material={feathers}
          position={[0, 0.44, 0.16]}
          rotation={[-0.4, 0, 0]}
          scale={[0.04, 0.08, 0.02]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

function EagleMesh({ tint, moving, level }: SpeciesProps) {
  const feathers = useMaterial(tint ?? DETAIL_COLORS.soil);
  const head = useMaterial('#e8eef4');
  const sphere = sphereFor(level);
  const soft = softBoxFor(level);
  const eye = eyeFor();
  return (
    <>
      <mesh
        geometry={sphere}
        material={feathers}
        position={[0, 0.32, 0]}
        rotation={[moving ? 0.6 : 0.25, 0, 0]}
        scale={[0.4, 0.44, 0.55]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={sphere}
          material={head}
          position={[0, 0.62, 0.24]}
          scale={[0.28, 0.26, 0.26]}
          raycast={noRaycast}
        />
        {/* hooked beak */}
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.beak)}
          position={[0, 0.58, 0.42]}
          scale={[0.07, 0.06, 0.1]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* round dark eyes */}
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[-0.09, 0.66, 0.44]}
          scale={[0.05, 0.05, 0.03]}
          raycast={noRaycast}
        />
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0.09, 0.66, 0.44]}
          scale={[0.05, 0.05, 0.03]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        {/* broad wing band — the soaring silhouette is the whole point up
            high; flaps on the `gait-flap-l` joint while moving */}
        <group
          name="gait-flap-l"
          position={[0, moving ? 0.42 : 0.34, 0]}
          rotation={[0, 0, moving ? 0 : -0.2]}
        >
          <mesh
            geometry={BOX}
            material={feathers}
            scale={[moving ? 1.6 : 0.5, 0.04, moving ? 0.36 : 0.5]}
            raycast={noRaycast}
          />
        </group>
      </Detail>
      <Detail level={level} min={3}>
        {/* talons — the raptor's grip */}
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.beak)}
          position={[-0.09, 0.05, 0.06]}
          scale={[0.06, 0.08, 0.1]}
          raycast={noRaycast}
        />
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.beak)}
          position={[0.09, 0.05, 0.06]}
          scale={[0.06, 0.08, 0.1]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={5}>
        {/* primary feather fingers on each wingtip */}
        <mesh
          geometry={BOX}
          material={feathers}
          position={[-0.85, 0.34, 0.05]}
          rotation={[0, 0, -0.15]}
          scale={[0.3, 0.02, 0.06]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={feathers}
          position={[0.85, 0.34, 0.05]}
          rotation={[0, 0, 0.15]}
          scale={[0.3, 0.02, 0.06]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={6}>
        {/* bald-eagle head + tail — the white cap the raptor is known by */}
        <mesh
          geometry={soft}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, 0.47, 0.28]}
          scale={[0.18, 0.1, 0.16]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, 0.3, -0.34]}
          scale={[0.16, 0.05, 0.14]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

function FishMesh({ tint, moving, level }: SpeciesProps) {
  const scales = useMaterial(tint ?? '#e08a3c');
  const sphere = sphereFor(level);
  const eye = eyeFor();
  return (
    <>
      {/* half-emerged at the waterline; origin sits on the water surface */}
      <mesh
        geometry={sphere}
        material={scales}
        position={[0, 0.02, 0]}
        scale={[0.16, 0.22, 0.4]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        {/* tail fin: kicks sideways while swimming — the `gait-swish`
            joint oscillates it while moving */}
        <group name="gait-swish" position={[0, 0.04, -0.3]} rotation={[0, moving ? 0.5 : 0.15, 0]}>
          <mesh geometry={BOX} material={scales} scale={[0.04, 0.16, 0.16]} raycast={noRaycast} />
        </group>
      </Detail>
      <Detail level={level} min={3}>
        {/* round dark eyes */}
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[-0.07, 0.1, 0.28]}
          scale={[0.035, 0.035, 0.02]}
          raycast={noRaycast}
        />
        <mesh
          geometry={eye}
          material={sharedLambert(DETAIL_COLORS.critterDark)}
          position={[0.07, 0.1, 0.28]}
          scale={[0.035, 0.035, 0.02]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={3}>
        {/* pectoral fins — one on each flank */}
        <mesh
          geometry={BOX}
          material={scales}
          position={[-0.1, 0.02, 0.06]}
          rotation={[0, 0, 0.4]}
          scale={[0.03, 0.1, 0.12]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={scales}
          position={[0.1, 0.02, 0.06]}
          rotation={[0, 0, -0.4]}
          scale={[0.03, 0.1, 0.12]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={5}>
        {/* second tail lobe — a real forked tail — kicks with the same
            swish joint, plus the lateral line */}
        <group name="gait-swish" position={[0, -0.06, -0.42]} rotation={[0.5, 0, 0]}>
          <mesh geometry={BOX} material={scales} scale={[0.03, 0.12, 0.1]} raycast={noRaycast} />
        </group>
        <mesh
          geometry={BOX}
          material={sharedLambert(DETAIL_COLORS.sign)}
          position={[0, 0.08, -0.02]}
          scale={[0.26, 0.015, 0.26]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        {/* dorsal fin */}
        <mesh
          geometry={BOX}
          material={scales}
          position={[0, 0.16, 0.02]}
          rotation={[0.15, 0, 0]}
          scale={[0.03, 0.14, 0.18]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

function ButterflyMesh({ tint, moving, level }: SpeciesProps) {
  const wings = useMaterial(tint ?? '#d96f9e');
  const body = useMaterial(DETAIL_COLORS.soil);
  const soft = softBoxFor(level);
  return (
    <>
      {/* slender body, upright — origin is the hover point */}
      <mesh
        geometry={soft}
        material={body}
        position={[0, 0, 0]}
        scale={[0.05, 0.05, 0.22]}
        raycast={noRaycast}
      />
      {/* two flat wings; angled up while fluttering, held wider at rest so
          the silhouette still reads as a butterfly from the fixed camera —
          `gait-flutter-*` joints beat the wings while moving */}
      <group
        name="gait-flutter-l"
        position={[-0.14, moving ? 0.04 : 0.02, 0]}
        rotation={[0, 0, moving ? 0.7 : 0.25]}
      >
        <mesh geometry={BOX} material={wings} scale={[0.24, 0.02, 0.3]} raycast={noRaycast} />
      </group>
      <group
        name="gait-flutter-r"
        position={[0.14, moving ? 0.04 : 0.02, 0]}
        rotation={[0, 0, moving ? -0.7 : -0.25]}
      >
        <mesh geometry={BOX} material={wings} scale={[0.24, 0.02, 0.3]} raycast={noRaycast} />
      </group>
      <Detail level={level} min={2}>
        {/* antennae nubs */}
        <mesh
          geometry={BOX}
          material={body}
          position={[0, 0.06, 0.13]}
          rotation={[0.4, 0, 0]}
          scale={[0.03, 0.08, 0.03]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

/**
 * Shared critter shell: the gait root mounts only while the critter moves or
 * finishes its settle flourish — idle species render with zero extra objects.
 * Used by both cubic species and the GLB animal variants.
 */
export function GaitedAnimal({
  moving = false,
  children,
}: {
  moving?: boolean;
  children: React.ReactNode;
}) {
  const gaitRoot = useRef<THREE.Group>(null);
  // The gait root also stays mounted for a short settle flourish after a
  // move ends — bounded, then the critter is a bare idle species again.
  const [settling, setSettling] = useState(false);
  const wasMoving = useRef(moving);
  useEffect(() => {
    if (wasMoving.current && !moving && !prefersReducedMotion()) setSettling(true);
    wasMoving.current = moving;
  }, [moving]);
  const onSettled = useCallback(() => setSettling(false), []);
  useCritterGait(gaitRoot, moving, onSettled);
  return moving || settling ? (
    <group ref={gaitRoot} dispose={null}>
      {children}
    </group>
  ) : (
    children
  );
}

export function CubicAnimal({ variant, tint, moving = false, detailLevel = 1 }: AnimalProps) {
  const species =
    variant === 'cat' ? (
      <CatMesh tint={tint} moving={moving} level={detailLevel} />
    ) : variant === 'duck' ? (
      <DuckMesh tint={tint} moving={moving} level={detailLevel} />
    ) : variant === 'dog' ? (
      <DogMesh tint={tint} moving={moving} level={detailLevel} />
    ) : variant === 'elephant' ? (
      <ElephantMesh tint={tint} moving={moving} level={detailLevel} />
    ) : variant === 'bird' ? (
      <BirdMesh tint={tint} moving={moving} level={detailLevel} />
    ) : variant === 'eagle' ? (
      <EagleMesh tint={tint} moving={moving} level={detailLevel} />
    ) : variant === 'fish' ? (
      <FishMesh tint={tint} moving={moving} level={detailLevel} />
    ) : (
      <ButterflyMesh tint={tint} moving={moving} level={detailLevel} />
    );
  return <GaitedAnimal moving={moving}>{species}</GaitedAnimal>;
}

/**
 * Cubic scenery — the every-tier silhouette behind `ModelSet.Scenery`.
 * Each variant is authored ~1 world unit on its largest axis inside a
 * `scale` group, so `scale` means the same thing as the GLB's `fitToSize`
 * target: a slot's scale is its world size on either provider. The trees'
 * accent canopy tuft drops out below detail 2 so the very-low/low
 * silhouette stays cheap.
 */
export function CubicScenery({ variant, scale = 1, detailLevel = 2 }: SceneryProps) {
  const trunk = useMaterial(DETAIL_COLORS.signPost);
  const leaf = useMaterial(DETAIL_COLORS.leaf);
  const leafDark = useMaterial(DETAIL_COLORS.leafDark);
  const stone = useMaterial(DETAIL_COLORS.stone);
  const soil = useMaterial(DETAIL_COLORS.soil);
  const metal = useMaterial(DETAIL_COLORS.critterDark);
  const lampGlow = useMaterial(DETAIL_COLORS.domeAccent);
  return (
    <group scale={scale} raycast={noRaycast}>
      {variant === 'fence' ? (
        // one posts-and-rail run; the GLB swaps in at the top detail level
        <FenceRun position={[0, 0, 0]} posts={4} spacing={0.35} />
      ) : variant === 'bush' ? (
        // dense rounded shrub — denser than a PlantCluster tuft
        <>
          <mesh
            geometry={BOX}
            material={leaf}
            position={[0, 0.2, 0]}
            scale={[0.44, 0.36, 0.4]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={leafDark}
            position={[0.12, 0.38, 0.06]}
            scale={[0.26, 0.2, 0.24]}
            raycast={noRaycast}
          />
        </>
      ) : variant === 'rock' ? (
        // one squat boulder — the single-rock counterpart of `rocks`
        <mesh
          geometry={BOX}
          material={stone}
          position={[0, 0.16, 0]}
          scale={[0.5, 0.32, 0.42]}
          raycast={noRaycast}
        />
      ) : variant === 'bench' ? (
        // seat + back + two legs, facing +z — matches the GLB's orientation
        <>
          <mesh
            geometry={BOX}
            material={trunk}
            position={[0, 0.22, 0]}
            scale={[0.6, 0.05, 0.22]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={trunk}
            position={[0, 0.34, -0.09]}
            scale={[0.6, 0.2, 0.04]}
            raycast={noRaycast}
          />
          {[-0.24, 0.24].map((x) => (
            <mesh
              key={x}
              geometry={BOX}
              material={trunk}
              position={[x, 0.1, 0]}
              scale={[0.05, 0.2, 0.18]}
              raycast={noRaycast}
            />
          ))}
        </>
      ) : variant === 'streetlight' ? (
        // thin pole + forward arm + warm lamp head — arm reaches -x to
        // match the GLB's neutral orientation under the shared rotationY
        <>
          <mesh
            geometry={BOX}
            material={metal}
            position={[0, 0.5, 0]}
            scale={[0.05, 1.0, 0.05]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={metal}
            position={[-0.09, 0.98, 0]}
            scale={[0.22, 0.05, 0.05]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={lampGlow}
            position={[-0.17, 0.92, 0]}
            scale={[0.09, 0.12, 0.09]}
            raycast={noRaycast}
          />
        </>
      ) : variant === 'rocks' ? (
        <>
          <mesh
            geometry={BOX}
            material={stone}
            position={[0, 0.12, 0]}
            scale={[0.52, 0.24, 0.36]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={stone}
            position={[0.36, 0.09, 0.12]}
            scale={[0.3, 0.18, 0.26]}
            raycast={noRaycast}
          />
        </>
      ) : variant === 'farm' ? (
        <>
          {/* tilled soil slab + a row of crop tufts — reads as the garden's
            little field at every tier; tufts are single leaf boxes (not
            PlantClusters) because this slot mounts at every detail level
            and the object budget is the ceiling */}
          <mesh
            geometry={BOX}
            material={soil}
            position={[0, 0.04, 0]}
            scale={[1.0, 0.08, 0.7]}
            raycast={noRaycast}
          />
          {[-0.3, 0, 0.3].map((x, i) => (
            <mesh
              key={i}
              geometry={BOX}
              material={i === 1 ? leafDark : leaf}
              position={[x, 0.12, i === 1 ? -0.12 : 0]}
              scale={[0.14, 0.14, 0.14]}
              raycast={noRaycast}
            />
          ))}
        </>
      ) : (
        // trees: trunk + one canopy mass; the silhouette variant (round /
        // spreading / tall) mirrors the GLB species the slot names
        <>
          <mesh
            geometry={BOX}
            material={trunk}
            position={[0, 0.22, 0]}
            scale={[0.13, 0.44, 0.13]}
            raycast={noRaycast}
          />
          {variant === 'tree-b' ? (
            <>
              <mesh
                geometry={BOX}
                material={leaf}
                position={[0, 0.55, 0]}
                scale={[0.72, 0.32, 0.6]}
                raycast={noRaycast}
              />
              <Detail level={detailLevel} min={2}>
                <mesh
                  geometry={BOX}
                  material={leafDark}
                  position={[0.3, 0.68, 0.1]}
                  scale={[0.3, 0.2, 0.28]}
                  raycast={noRaycast}
                />
              </Detail>
            </>
          ) : variant === 'tree-c' ? (
            <>
              <mesh
                geometry={BOX}
                material={leafDark}
                position={[0, 0.6, 0]}
                scale={[0.4, 0.6, 0.36]}
                raycast={noRaycast}
              />
              <Detail level={detailLevel} min={2}>
                <mesh
                  geometry={BOX}
                  material={leaf}
                  position={[0, 0.92, 0]}
                  scale={[0.26, 0.2, 0.24]}
                  raycast={noRaycast}
                />
              </Detail>
            </>
          ) : (
            <>
              <mesh
                geometry={BOX}
                material={leaf}
                position={[0, 0.62, 0]}
                scale={[0.56, 0.46, 0.5]}
                raycast={noRaycast}
              />
              <Detail level={detailLevel} min={2}>
                <mesh
                  geometry={BOX}
                  material={leafDark}
                  position={[0.08, 0.9, 0.04]}
                  scale={[0.34, 0.24, 0.3]}
                  raycast={noRaycast}
                />
              </Detail>
            </>
          )}
        </>
      )}
    </group>
  );
}
