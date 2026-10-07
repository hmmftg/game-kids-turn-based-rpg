import { useEffect, useImperativeHandle, type Ref } from 'react';
import { publishCameraFocus } from './CameraRig.tsx';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  AnchorId,
  AvatarId,
  DiscoveryId,
  HeadwearId,
  QuestId,
  QuestStatus,
} from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import type { AreaId, EnvironmentDefinition } from '../domain/world/types.ts';
import { getAnchor, getAnchorOrNull } from './navigation/graph.ts';
import {
  areaForAnchor,
  npcFigureJitter,
  resolveNpcActivity,
  resolveNpcStand,
  visibleAreaIds,
} from './registry.ts';
import { BOX, CIRCLE, CYLINDER, sharedLambert } from './models/shared.ts';
import {
  CharacterReact,
  EnvironmentLights,
  Hotspot,
  type NpcAttention,
  type WorldSceneHandle,
} from './sceneBits.tsx';
import { NPC_STAND_OFFSET } from './placement.ts';
import { npcLook } from './npcLooks.ts';
import { activityPoseFor, idleCueFor, resolveNpcPresentation } from './liveliness.ts';
import { IdleFlourish, NpcTransit } from './livelinessBits.tsx';
import { nearestWalkableAnchor } from './navigation/pathfinding.ts';
import { noRaycast } from './models/raycast.ts';
import { useWalker } from './useWalker.ts';
import { AVATAR_VISUALS, useModels, type DetailLevel } from './models/modelProvider.ts';
import type { AnimalVisualVariant } from './models/modelProvider.ts';

export type ChallengeHandle = WorldSceneHandle;

export interface ChallengeWorldProps {
  /** World data — the static source (fact-filtered) in the game, a document
      source in the World Builder preview. */
  readonly world: WorldSource;
  readonly avatarId: AvatarId;
  readonly headwear: HeadwearId;
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly interactive: boolean;
  readonly detailLevel: DetailLevel;
  readonly startAnchorId: AnchorId;
  readonly environment: EnvironmentDefinition;
  readonly onArrive: (anchor: AnchorId) => void;
  /** Tap an opponent figure → start its battle, same ownership as the town. */
  readonly onNpcTap?: ((npcId: string) => void) | undefined;
  readonly worldTime?: number | undefined;
  /** Per-NPC routine holds: figures the child stands beside keep this
      frozen tick instead of `worldTime` (same resolveNpcStand truth). */
  readonly npcStandTicks?: ReadonlyMap<string, number> | undefined;
  /** Who noticed the latest arrival — replays a one-shot cue per nonce. */
  readonly attention?: NpcAttention | null | undefined;
  /** Persisted world facts — victory facts drive presentation and the
      gated bridge/path props. */
  readonly discoveries: readonly DiscoveryId[];
  readonly handleRef: Ref<ChallengeHandle> | undefined;
}

const MAP_ID = 'map-challenge';
const FLOOR = new THREE.CircleGeometry(11, 40);

/** Which Animal variant an opponent renders — keyed by npcId, never a
    bespoke component. Truthful silhouettes only (review rule): the bird is
    a bird, the eagle an eagle, the butterfly a butterfly. */
const OPPONENT_VARIANTS: Readonly<Record<string, AnimalVisualVariant>> = {
  'npc-playful-mouse': 'cat',
  'npc-challenge-bird': 'bird',
  'npc-challenge-eagle': 'eagle',
  'npc-challenge-butterfly': 'butterfly',
};

/** Pennant flags marking the challenge field — static props, no animation. */
function BannerRow() {
  const pole = sharedLambert('#6b4e3a');
  const flagA = sharedLambert('#e05545');
  const flagB = sharedLambert('#4a8ad4');
  const spots: readonly { x: number; z: number; flag: THREE.Material }[] = [
    { x: -1.6, z: 3.9, flag: flagA },
    { x: 1.6, z: 3.9, flag: flagB },
    { x: -1.8, z: -0.9, flag: flagB },
    { x: 1.9, z: -1.6, flag: flagA },
    { x: -2.2, z: -3.6, flag: flagA },
  ];
  return (
    <group dispose={null}>
      {spots.map((spot, i) => (
        <group key={i} position={[spot.x, 0, spot.z]}>
          <mesh
            geometry={CYLINDER}
            material={pole}
            position={[0, 0.8, 0]}
            scale={[0.05, 1.6, 0.05]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={spot.flag}
            position={[0.22, 1.35, 0]}
            scale={[0.42, 0.26, 0.04]}
            raycast={noRaycast}
          />
        </group>
      ))}
    </group>
  );
}

/** Big friendly boulders ringing the field — adventure, not battlefield. */
function ChallengeRocks({ detailLevel }: { readonly detailLevel: DetailLevel }) {
  if (detailLevel < 1) return null;
  const rock = sharedLambert('#8a7a68');
  const rockWarm = sharedLambert('#a08a70');
  const spots: readonly [number, number, number, number][] = [
    // [x, z, scale, height]
    [-4.6, 1.8, 0.9, 1.2],
    [4.4, 0.6, 0.7, 0.9],
    [-4.2, -3.0, 0.8, 1.0],
    [3.6, -3.6, 1.0, 1.4],
    [-1.6, -4.6, 0.6, 0.7],
    [1.8, -4.8, 0.7, 0.8],
  ];
  return (
    <group dispose={null}>
      {spots.map(([x, z, s, h], i) => (
        <mesh
          key={i}
          geometry={BOX}
          material={i % 2 === 0 ? rock : rockWarm}
          position={[x, h / 2, z]}
          scale={[s, h, s]}
          rotation={[0, (i * 0.9) % 1.4, (i % 3) * 0.06]}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}

/** Rest spot: a soft patch of grass with a little log to sit on. */
function RestSpot() {
  return (
    <group position={[-0.8, 0, -3.4]} name="challenge-rest" dispose={null}>
      <mesh
        geometry={CIRCLE}
        material={sharedLambert('#7fae6a')}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.1, 1.1, 1]}
        position={[0, 0.012, 0]}
        raycast={noRaycast}
      />
      <mesh
        geometry={CYLINDER}
        material={sharedLambert('#8a6a4a')}
        position={[0.3, 0.14, -0.2]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[0.16, 0.9, 0.16]}
        raycast={noRaycast}
      />
    </group>
  );
}

/**
 * The way into the depths: a chasm with crossing props. Before any victory
 * fact is recorded the crossing reads closed — a rockfall blocks it — and
 * the gated edges are absent from the fact-filtered world, so a ground tap
 * past the gap finds no path. Once either gated fact is recorded the way
 * reads open: planks span the gap and the "you opened this" pennant flies.
 * Physical state, never a marker.
 */
function DepthsCrossing({ discoveries }: { readonly discoveries: readonly DiscoveryId[] }) {
  const opened =
    discoveries.includes('discovery-challenge-butterfly') ||
    discoveries.includes('discovery-challenge-eagle');
  return (
    <group position={[0, 0, -4.2]} name="challenge-crossing" dispose={null}>
      {/* the chasm lip — a dark seam across the path */}
      <mesh
        geometry={BOX}
        material={sharedLambert('#5c4a56')}
        position={[0, 0.05, -0.35]}
        scale={[4.4, 0.1, 1.1]}
        raycast={noRaycast}
      />
      {opened ? (
        <>
          {/* planks spanning the gap — the opened bridge */}
          {[-0.8, -0.3, 0.2, 0.7].map((x, i) => (
            <mesh
              key={i}
              geometry={BOX}
              material={sharedLambert('#a87a4e')}
              position={[x, 0.09, -0.35]}
              scale={[0.42, 0.08, 1.3]}
              rotation={[0, i % 2 === 0 ? 0.04 : -0.04, 0]}
              raycast={noRaycast}
            />
          ))}
          {/* celebration pennant on the far side */}
          <group position={[1.4, 0, -1.2]}>
            <mesh
              geometry={CYLINDER}
              material={sharedLambert('#6b4e3a')}
              position={[0, 0.7, 0]}
              scale={[0.05, 1.4, 0.05]}
              raycast={noRaycast}
            />
            <mesh
              geometry={BOX}
              material={sharedLambert('#f0b23e')}
              position={[0.22, 1.2, 0]}
              scale={[0.42, 0.26, 0.04]}
              raycast={noRaycast}
            />
          </group>
        </>
      ) : (
        <>
          {/* fallen rocks blocking the crossing — reads as closed, never a
              lock icon */}
          {[-0.5, 0.1, 0.6].map((x, i) => (
            <mesh
              key={i}
              geometry={BOX}
              material={sharedLambert('#7a6a5e')}
              position={[x, 0.2, -0.35]}
              scale={[0.5, 0.4, 0.5]}
              rotation={[0, (i * 0.8) % 1.2, 0]}
              raycast={noRaycast}
            />
          ))}
        </>
      )}
    </group>
  );
}

/**
 * The Challenge Zone: an adventure playground reached through the cave's
 * deep tunnel. Renders only while `map-challenge` is the current map.
 * Reuses the shared data-driven machinery — useWalker, Hotspot,
 * resolveNpcStand/NPC_STAND_OFFSET/npcFigureJitter, NpcTransit,
 * CharacterReact, IdleFlourish — opponents are plain NPC rows rendered by
 * one loop, never per-enemy components.
 */
export function ChallengeWorld({
  world,
  avatarId,
  headwear,
  questStatuses,
  interactive,
  detailLevel,
  startAnchorId,
  environment,
  onArrive,
  onNpcTap,
  worldTime = 0,
  npcStandTicks,
  attention,
  discoveries,
  handleRef,
}: ChallengeWorldProps) {
  const models = useModels();
  const walker = useWalker(world, startAnchorId, onArrive, interactive);
  // The follow-camera reads the avatar's live position from this shared
  // store — same useWalker source of truth, never a second copy.
  useEffect(() => {
    publishCameraFocus(walker.focus.x, walker.focus.z);
  });
  const activeAreaId: AreaId = areaForAnchor(world, walker.at);
  const visibleAreas = visibleAreaIds(world, activeAreaId);

  useImperativeHandle(
    handleRef,
    () => ({
      goTo: (anchor, onArrived) => {
        const walked = walker.walkTo(anchor, () => {
          onArrive(anchor);
          onArrived?.();
        });
        return walked;
      },
      cancel: () => {
        walker.cancel();
      },
      playerPosition: () => ({ x: walker.position.x, z: walker.position.z }),
    }),
    [walker, onArrive],
  );

  const walkHere = (anchor: AnchorId) => {
    walker.walkTo(anchor, () => {
      onArrive(anchor);
    });
  };

  const entryAnchor = getAnchor(world, 'anchor-challenge-entry');

  // Opponent figures: every NPC whose resolved stand lands on this map in a
  // visible area — the Hub's mounting rule applied to the challenge field.
  // Positions come from the ONE spatial truth (resolveNpcStand +
  // NPC_STAND_OFFSET + jitter), identical to what App's proximity-hold and
  // onNpcTap compute.
  const opponents = world.npcDefinitions.flatMap((npc, index) => {
    const npcTick = npcStandTicks?.get(npc.id) ?? worldTime;
    const stand = resolveNpcStand(world, npc, npcTick);
    const anchor = getAnchorOrNull(world, stand.anchorId);
    if (!anchor) return [];
    if (anchor.mapId !== MAP_ID) return [];
    if (!visibleAreas.includes(anchor.areaId)) return [];
    const jitter = npcFigureJitter(world, npc.id);
    const npcX = anchor.x + NPC_STAND_OFFSET.x + stand.offsetX + jitter.x;
    const npcZ = anchor.z + NPC_STAND_OFFSET.z + stand.offsetZ + jitter.z;
    const dx = walker.position.x - npcX;
    const dz = walker.position.z - npcZ;
    const facing = Math.hypot(dx, dz) < 6 ? Math.atan2(dx, dz) : (stand.spot?.facing ?? 0);
    const look = npcLook(npc.id);
    return [
      {
        npc,
        npcX,
        npcZ,
        facing,
        look,
        cue: idleCueFor(index, worldTime),
        // Fact-derived celebration overrides the routine pose — a solved
        // challenger relaxes/greets; the resolver is the only place that
        // knows which fact means which feeling.
        pose:
          resolveNpcPresentation(npc.id, questStatuses, discoveries).pose ??
          activityPoseFor(resolveNpcActivity(npc, npcTick)),
        variant: OPPONENT_VARIANTS[npc.id] ?? 'cat',
      },
    ];
  });

  return (
    <group>
      <EnvironmentLights env={environment} />

      {/* Ground doubles as the walk surface — taps resolve to anchors on
          this map only. */}
      <mesh
        geometry={FLOOR}
        material={sharedLambert('#c9a06a')}
        rotation={[-Math.PI / 2, 0, 0]}
        name="ground"
        position={[0, 0, -0.5]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (!interactive || event.delta > 6) return;
          event.stopPropagation();
          const anchor = nearestWalkableAnchor(world, event.point.x, event.point.z, 4, MAP_ID);
          if (anchor) walkHere(anchor);
          else walker.faceToward(event.point.x, event.point.z);
        }}
      />

      {/* Warm grass field patch under the field area. */}
      <mesh
        geometry={CIRCLE}
        material={sharedLambert('#8fae62')}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[5.4, 4.6, 1]}
        position={[0, 0.008, -0.6]}
        raycast={noRaycast}
      />

      {world.anchors
        .filter((anchor) => anchor.walkable && anchor.mapId === MAP_ID)
        .map((anchor) => (
          <mesh
            key={`path-${anchor.id}`}
            geometry={CIRCLE}
            material={sharedLambert('#e0c090')}
            scale={[1.0, 1.0, 1]}
            position={[anchor.x, 0.015, anchor.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={noRaycast}
          />
        ))}

      <BannerRow />
      <ChallengeRocks detailLevel={detailLevel} />
      <RestSpot />
      <DepthsCrossing discoveries={discoveries} />

      {/* The way back: a tappable hotspot on the gate anchor — arriving
          there resolves `transition-challenge-exit` via the shared arrival
          handler. */}
      <Hotspot
        x={entryAnchor.x}
        z={entryAnchor.z}
        active={interactive}
        label="hotspot-exit"
        onSelect={() => walkHere('anchor-challenge-entry')}
      />

      {/* Gate archway beside the entry anchor — the tunnel mouth home. */}
      <group
        position={[entryAnchor.x, 0, entryAnchor.z + 1.4]}
        name="challenge-gate"
        dispose={null}
      >
        <mesh
          geometry={BOX}
          material={sharedLambert('#8a6a5a')}
          position={[-1.1, 1.1, 0]}
          scale={[0.7, 2.2, 0.7]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#8a6a5a')}
          position={[1.1, 1.1, 0]}
          scale={[0.7, 2.2, 0.7]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#8a6a5a')}
          position={[0, 2.35, 0]}
          scale={[3, 0.5, 0.7]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#3a3040')}
          position={[0, 1.05, 0]}
          scale={[1.5, 2.1, 0.2]}
          raycast={noRaycast}
        />
      </group>

      {/* Opponents — deliberate tappable figures. A tap on the figure starts
          its battle (the App's battleForOpponent path); walking beside one
          never does. Same tap cylinder + attention cue + pose machinery as
          the town. */}
      {opponents.map(({ npc, npcX, npcZ, facing, look, cue, pose, variant }) => (
        <group key={npc.id}>
          <NpcTransit x={npcX} z={npcZ} facing={facing} name={`npc-transit-${npc.id}`}>
            <mesh
              position={[0, 0.75, 0]}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                if (!interactive || event.delta > 6) return;
                if (!onNpcTap) return;
                event.stopPropagation();
                onNpcTap(npc.id);
              }}
            >
              <cylinderGeometry args={[0.45, 0.45, 2.2, 8]} />
              <meshBasicMaterial visible={false} />
            </mesh>
            <group>
              <CharacterReact
                npcId={npc.id}
                nonce={attention?.npcId === npc.id ? attention.nonce : 0}
                context={attention?.context ?? 'notices-child'}
                armColor={look.palette.limb}
              >
                <IdleFlourish nonce={worldTime} cue={cue} pose={pose}>
                  <group rotation={[0, facing, 0]}>
                    <models.Animal
                      variant={variant}
                      tint={look.palette.body}
                      detailLevel={detailLevel}
                    />
                  </group>
                </IdleFlourish>
              </CharacterReact>
            </group>
          </NpcTransit>
        </group>
      ))}

      {/* Avatar — same model and walk feel as outside. */}
      <models.Figure
        position={walker.position}
        rotationY={walker.heading}
        bobbing={walker.bobbing}
        moving={walker.moving}
        palette={AVATAR_VISUALS[avatarId].palette}
        headwear={headwear}
        hairStyle={AVATAR_VISUALS[avatarId].hairStyle}
        hairColor={AVATAR_VISUALS[avatarId].hairColor}
        label="avatar"
        detailLevel={detailLevel}
        role="avatar"
      />
    </group>
  );
}
