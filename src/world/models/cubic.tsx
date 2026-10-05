import type { HeadwearId } from '../../domain/game/types.ts';
import type {
  AnimalProps,
  AvatarHairStyle,
  DetailLevel,
  FigureProps,
  FigureVisualRole,
  LandmarkProps,
  PropProps,
} from './modelProvider.ts';
import { noRaycast } from './raycast.ts';
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
  CYLINDER,
  DETAIL_COLORS,
  SHADOW_MATERIAL,
  SPHERE,
  sharedLambert,
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
  return (
    <Detail level={level} min={1}>
      {/* `face-eye` names let the presentation-liveliness layer blink the
          eyes without touching the figure contract. */}
      <mesh
        name="face-eye"
        geometry={BOX}
        material={sharedLambert('#33303a')}
        position={[-0.09, 1.2 + lift, 0.2]}
        scale={[0.05, 0.07, 0.02]}
        raycast={noRaycast}
      />
      <mesh
        name="face-eye"
        geometry={BOX}
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
  switch (role) {
    case 'elder':
      return (
        <Detail level={level} min={1}>
          {/* cane */}
          <mesh
            geometry={CYLINDER}
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
              geometry={CYLINDER}
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
            geometry={CYLINDER}
            material={sharedLambert('#d9cba8')}
            position={[0, 1.36 + lift, 0]}
            scale={[0.72, 0.05, 0.72]}
            raycast={noRaycast}
          />
          <mesh
            geometry={CYLINDER}
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
        <>
          <Face lift={lift} level={level} />
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
  label,
  headwear = 'none',
  hairStyle,
  hairColor = '#3a2a1c',
  detailLevel = 1,
  role,
}: FigureProps) {
  const body = useMaterial(palette.body);
  const head = useMaterial(palette.head);
  const limb = useMaterial(palette.limb);
  const lift = Math.sin(bobbing) * 0.05;
  // Squash-and-stretch only while walking; settles rigid on arrival.
  const squash = moving ? 1 + Math.sin(bobbing * 2) * 0.05 : 1;

  return (
    <group
      position={[position.x, 0, position.z]}
      rotation={[0, rotationY, 0]}
      name={label ?? ''}
      dispose={null}
      scale={[1, squash, 1]}
    >
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
        geometry={detailLevel >= 2 ? SPHERE : BOX}
        material={head}
        position={[0, 1.14 + lift, 0]}
        scale={[0.42, 0.38, 0.38]}
        raycast={noRaycast}
      />
      {role !== undefined ? <RoleDetails role={role} lift={lift} level={detailLevel} /> : null}
      <Headwear id={headwear} lift={lift} />
      {/* Covered heads skip hair entirely — headwear replaces the silhouette. */}
      {role === 'avatar' && headwear === 'none' && hairStyle ? (
        <Hair style={hairStyle} color={hairColor} lift={lift} level={detailLevel} />
      ) : null}
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

/** Flattened dome + finial — shared SPHERE, no new geometry. */
function DomeRoof({ width, height }: { readonly width: number; readonly height: number }) {
  return (
    <>
      <mesh
        geometry={SPHERE}
        material={sharedLambert(DETAIL_COLORS.dome)}
        position={[0, height + 0.3, 0]}
        scale={[width * 0.85, 0.55, width * 0.85]}
        raycast={noRaycast}
      />
      <mesh
        geometry={SPHERE}
        material={sharedLambert(DETAIL_COLORS.domeAccent)}
        position={[0, height + 0.62, 0]}
        scale={[0.14, 0.18, 0.14]}
        raycast={noRaycast}
      />
    </>
  );
}

/** Rounded arch cap over a door — half of a squashed sphere. */
function ArchCap({ position, width = 0.34 }: { readonly position: Xyz; readonly width?: number }) {
  return (
    <mesh
      geometry={SPHERE}
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
        <DomeRoof width={width} height={height} />
        <WindowDetail position={[-0.32, height * 0.55, faceZ]} />
      </Detail>
      <Detail level={level} min={2}>
        <ArchCap position={[0.15, 0.62, faceZ + 0.01]} />
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
        <DomeRoof width={width * 0.7} height={height} />
        {/* banner: two posts + cloth slab */}
        <mesh
          geometry={CYLINDER}
          material={sharedLambert(DETAIL_COLORS.signPost)}
          position={[-width * 0.8, 0.5, capDetailZ(faceZ + 0.3)]}
          scale={[0.05, 1.0, 0.05]}
          raycast={noRaycast}
        />
        <mesh
          geometry={CYLINDER}
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
        <ArchCap position={[0, 0.8, faceZ + 0.01]} width={0.5} />
        <RoofTrim width={width} y={height - 0.08} />
      </Detail>
    </>
  );
}

/** fountain: basin ring + static water disc + center pillar. No animation. */
function FountainDetails({ level }: { readonly level: DetailLevel }) {
  return (
    <>
      <mesh
        geometry={CYLINDER}
        material={sharedLambert(DETAIL_COLORS.stone)}
        position={[0, 0.16, 0]}
        scale={[1.6, 0.32, 1.6]}
        raycast={noRaycast}
      />
      <mesh
        geometry={CYLINDER}
        material={sharedLambert(DETAIL_COLORS.water)}
        position={[0, 0.33, 0]}
        scale={[1.3, 0.04, 1.3]}
        raycast={noRaycast}
      />
      <mesh
        geometry={CYLINDER}
        material={sharedLambert(DETAIL_COLORS.stone)}
        position={[0, 0.6, 0]}
        scale={[0.3, 0.6, 0.3]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={CYLINDER}
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
      {variant === 'ball' ? (
        <mesh
          geometry={SPHERE}
          material={material}
          position={[0, scale / 2, 0]}
          scale={[scale, scale, scale]}
          raycast={noRaycast}
        />
      ) : (
        <mesh
          geometry={shape === 'box' ? BOX : CYLINDER}
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
              geometry={CYLINDER}
              material={sharedLambert(DETAIL_COLORS.soil)}
              position={[0, scale + 0.01, 0]}
              scale={[scale * 0.85, 0.04, scale * 0.85]}
              raycast={noRaycast}
            />
            <PlantCluster position={[0, scale, 0]} scale={0.9} />
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

function CatMesh({ tint, moving, level }: SpeciesProps) {
  const fur = useMaterial(tint ?? '#d98a4a');
  return (
    <>
      {/* body: squashed sphere; sits upright when idle, stretched forward when running */}
      <mesh
        geometry={SPHERE}
        material={fur}
        position={[0, moving ? 0.26 : 0.3, 0]}
        rotation={[moving ? -0.25 : 0.35, 0, 0]}
        scale={[0.42, moving ? 0.36 : 0.5, 0.55]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={SPHERE}
          material={fur}
          position={[0, 0.58, 0.22]}
          scale={[0.3, 0.28, 0.28]}
          raycast={noRaycast}
        />
        {/* tail: raised when running, curled low when sitting */}
        <mesh
          geometry={BOX}
          material={fur}
          position={[0, moving ? 0.5 : 0.3, -0.38]}
          rotation={[moving ? -0.4 : 0.6, 0, 0]}
          scale={[0.07, 0.5, 0.07]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        {/* ear strip across the top of the head */}
        <mesh
          geometry={BOX}
          material={fur}
          position={[0, 0.8, 0.2]}
          scale={[0.3, 0.12, 0.06]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

function BirdMesh({ tint, moving, level }: SpeciesProps) {
  const feathers = useMaterial(tint ?? '#5b8ab5');
  const beak = useMaterial(DETAIL_COLORS.beak);
  return (
    <>
      <mesh
        geometry={SPHERE}
        material={feathers}
        position={[0, 0.22, 0]}
        rotation={[0.3, 0, 0]}
        scale={[0.26, 0.28, 0.34]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={SPHERE}
          material={feathers}
          position={[0, 0.4, 0.16]}
          scale={[0.2, 0.2, 0.2]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        <mesh
          geometry={BOX}
          material={beak}
          position={[0, 0.4, 0.3]}
          scale={[0.06, 0.05, 0.1]}
          raycast={noRaycast}
        />
        {/* wing band: a wide flat slab — spread while flying, folded back when perched */}
        <mesh
          geometry={BOX}
          material={feathers}
          position={[0, moving ? 0.3 : 0.26, moving ? 0 : -0.1]}
          rotation={[moving ? 0 : -0.5, 0, 0]}
          scale={[moving ? 0.72 : 0.3, 0.03, moving ? 0.2 : 0.3]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

function EagleMesh({ tint, moving, level }: SpeciesProps) {
  const feathers = useMaterial(tint ?? DETAIL_COLORS.soil);
  const head = useMaterial('#e8eef4');
  return (
    <>
      <mesh
        geometry={SPHERE}
        material={feathers}
        position={[0, 0.32, 0]}
        rotation={[moving ? 0.6 : 0.25, 0, 0]}
        scale={[0.4, 0.44, 0.55]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        <mesh
          geometry={SPHERE}
          material={head}
          position={[0, 0.62, 0.24]}
          scale={[0.28, 0.26, 0.26]}
          raycast={noRaycast}
        />
      </Detail>
      <Detail level={level} min={2}>
        {/* broad wing band — the soaring silhouette is the whole point up high */}
        <mesh
          geometry={BOX}
          material={feathers}
          position={[0, moving ? 0.42 : 0.34, 0]}
          rotation={[0, 0, moving ? 0 : -0.2]}
          scale={[moving ? 1.6 : 0.5, 0.04, moving ? 0.36 : 0.5]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

function FishMesh({ tint, moving, level }: SpeciesProps) {
  const scales = useMaterial(tint ?? '#e08a3c');
  return (
    <>
      {/* half-emerged at the waterline; origin sits on the water surface */}
      <mesh
        geometry={SPHERE}
        material={scales}
        position={[0, 0.02, 0]}
        scale={[0.16, 0.22, 0.4]}
        raycast={noRaycast}
      />
      <Detail level={level} min={1}>
        {/* tail fin: kicks sideways while swimming */}
        <mesh
          geometry={BOX}
          material={scales}
          position={[0, 0.04, -0.3]}
          rotation={[0, moving ? 0.5 : 0.15, 0]}
          scale={[0.04, 0.16, 0.16]}
          raycast={noRaycast}
        />
      </Detail>
    </>
  );
}

export function CubicAnimal({ variant, tint, moving = false, detailLevel = 1 }: AnimalProps) {
  switch (variant) {
    case 'cat':
      return <CatMesh tint={tint} moving={moving} level={detailLevel} />;
    case 'bird':
      return <BirdMesh tint={tint} moving={moving} level={detailLevel} />;
    case 'eagle':
      return <EagleMesh tint={tint} moving={moving} level={detailLevel} />;
    case 'fish':
      return <FishMesh tint={tint} moving={moving} level={detailLevel} />;
  }
}
