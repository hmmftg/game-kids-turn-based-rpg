import { useEffect, useImperativeHandle, type Ref } from 'react';
import { publishCameraFocus } from './CameraRig.tsx';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { AnchorId, AvatarId, HeadwearId, QuestId, QuestStatus } from '../domain/game/types.ts';
import { QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import type { WorldSource } from '../domain/world/source.ts';
import type { AreaId, EnvironmentDefinition } from '../domain/world/types.ts';
import { getAnchor, getAnchorOrNull } from './navigation/graph.ts';
import { areaForAnchor, visibleAreaIds } from './registry.ts';
import { CIRCLE, BOX, CYLINDER, SPHERE, sharedLambert } from './models/shared.ts';
import { CharacterReact, Hotspot, type NpcAttention, type WorldSceneHandle } from './sceneBits.tsx';
import { CAVE_MOUSE_OFFSET } from './placement.ts';
import { nearestWalkableAnchor } from './navigation/pathfinding.ts';
import { noRaycast } from './models/raycast.ts';
import { useWalker } from './useWalker.ts';
import { AVATAR_VISUALS, useModels, type DetailLevel } from './models/modelProvider.ts';

export type CaveHandle = WorldSceneHandle;

export interface CaveWorldProps {
  /** World data — the static source in the game, a document source in the
      World Builder preview. */
  readonly world: WorldSource;
  readonly avatarId: AvatarId;
  readonly headwear: HeadwearId;
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly interactive: boolean;
  readonly detailLevel: DetailLevel;
  readonly startAnchorId: AnchorId;
  readonly environment: EnvironmentDefinition;
  readonly onArrive: (anchor: AnchorId) => void;
  /** Tap the resident → talk, same ownership rule as the town. */
  readonly onNpcTap?: ((npcId: string) => void) | undefined;
  /** Who noticed the latest arrival — replays a one-shot cue per nonce. */
  readonly attention?: NpcAttention | null | undefined;
  readonly handleRef: Ref<CaveHandle> | undefined;
}

const MAP_ID = 'map-cave';
const FLOOR = new THREE.CircleGeometry(6, 36);

/** Lights defined by the map's EnvironmentDefinition — data, not per-scene code. */
function EnvironmentLights({ env }: { readonly env: EnvironmentDefinition }) {
  return (
    <>
      <hemisphereLight
        args={[env.hemisphere.sky, env.hemisphere.ground, env.hemisphere.intensity]}
      />
      {env.directionals.map((light, i) => (
        <directionalLight
          key={i}
          color={light.color}
          position={[light.position[0], light.position[1], light.position[2]]}
          intensity={light.intensity}
        />
      ))}
    </>
  );
}

/**
 * A ring of rough rock walls around the cave bounds, with a dark cap so the
 * cavern reads as an enclosed space from the isometric camera.
 */
function CaveShell() {
  const rock = sharedLambert('#4a4454');
  const rockDark = sharedLambert('#3a3544');
  const wallSpots: readonly [number, number, number][] = [
    [-4.6, -0.5, 2.4],
    [4.6, -0.5, 2.4],
    [-3.4, -3.6, 2.0],
    [3.4, -3.6, 2.0],
    [-1.2, -4.3, 2.2],
    [1.4, -4.3, 2.2],
    [-4.2, 3.9, 1.8],
    [4.2, 3.9, 1.8],
  ];
  return (
    <group dispose={null}>
      {wallSpots.map(([x, z, h], i) => (
        <mesh
          key={i}
          geometry={BOX}
          material={rock}
          position={[x, h / 2, z]}
          scale={[1.9, h, 1.9]}
          rotation={[0, (i * 0.7) % 1.2, 0]}
          raycast={noRaycast}
        />
      ))}
      {/* ceiling lip so the cave edge reads closed, not clipped */}
      <mesh
        geometry={BOX}
        material={rockDark}
        position={[0, 3.4, -4.6]}
        scale={[9.6, 2.4, 2]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={rockDark}
        position={[-5.6, 3.2, 0]}
        scale={[2.4, 2.2, 9.6]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={rockDark}
        position={[5.6, 3.2, 0]}
        scale={[2.4, 2.2, 9.6]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** The cave's focal point: a cluster of glowing crystals in the back. */
function CrystalCluster() {
  const crystal = sharedLambert('#a98fe8');
  const glow = sharedLambert('#d4b8ff');
  return (
    <group position={[2.2, 0, -2.6]} name="crystal-cluster" dispose={null}>
      <mesh
        geometry={BOX}
        material={crystal}
        position={[0, 0.7, 0]}
        scale={[0.5, 1.5, 0.5]}
        rotation={[0, 0.5, 0.12]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={glow}
        position={[0.55, 0.45, 0.15]}
        scale={[0.3, 0.9, 0.3]}
        rotation={[0, -0.3, -0.2]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={crystal}
        position={[-0.5, 0.4, 0.1]}
        scale={[0.26, 0.8, 0.26]}
        rotation={[0.15, 0.2, 0.3]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={glow}
        position={[0.15, 0.25, 0.6]}
        scale={[0.2, 0.5, 0.2]}
        rotation={[0.4, 0.1, -0.35]}
        raycast={noRaycast}
      />
      {/* the warm shimmer that lights the cavern — static, no animation */}
      <pointLight color="#c9a6ff" intensity={1.6} distance={6.5} position={[0, 1.2, 0]} />
    </group>
  );
}

/** A still underground pool — flat and dark, catching the crystal light. */
function CavePool() {
  return (
    <group position={[-2.2, 0.012, -1.4]} name="cave-pool" dispose={null}>
      <mesh
        geometry={CIRCLE}
        material={sharedLambert('#3d5a80')}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.5, 1.5, 1]}
        raycast={noRaycast}
      />
      <mesh
        geometry={CIRCLE}
        material={sharedLambert('#8fa8c9')}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.9, 0.9, 1]}
        position={[0, 0.004, 0]}
        raycast={noRaycast}
      />
    </group>
  );
}

/** Scattered floor stones + stalagmite silhouettes — detail-gated props. */
function CaveProps({ detailLevel }: { readonly detailLevel: DetailLevel }) {
  if (detailLevel < 1) return null;
  const stone = sharedLambert('#5a5464');
  return (
    <group dispose={null}>
      <mesh
        geometry={CYLINDER}
        material={stone}
        position={[-3.4, 0.35, 1.6]}
        scale={[0.3, 0.7, 0.3]}
        raycast={noRaycast}
      />
      <mesh
        geometry={CYLINDER}
        material={stone}
        position={[3.6, 0.28, 0.8]}
        scale={[0.22, 0.55, 0.22]}
        raycast={noRaycast}
      />
      <mesh
        geometry={SPHERE}
        material={stone}
        position={[-0.8, 0.14, -2.6]}
        scale={[0.4, 0.28, 0.4]}
        raycast={noRaycast}
      />
      {detailLevel >= 2 ? (
        <mesh
          geometry={SPHERE}
          material={stone}
          position={[1.4, 0.12, 1.9]}
          scale={[0.3, 0.2, 0.3]}
          raycast={noRaycast}
        />
      ) : null}
    </group>
  );
}

/** The bright doorway back out — the exit hotspot lives on its walkable anchor. */
function ExitArchway({ world }: { readonly world: WorldSource }) {
  const mouth = getAnchor(world, 'anchor-cave-mouth');
  return (
    <group position={[mouth.x, 0, mouth.z + 1.5]} name="cave-exit" dispose={null}>
      <mesh
        geometry={BOX}
        material={sharedLambert('#4a4454')}
        position={[-1.1, 1.1, 0]}
        scale={[0.7, 2.2, 0.7]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert('#4a4454')}
        position={[1.1, 1.1, 0]}
        scale={[0.7, 2.2, 0.7]}
        raycast={noRaycast}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert('#4a4454')}
        position={[0, 2.35, 0]}
        scale={[3, 0.5, 0.7]}
        raycast={noRaycast}
      />
      {/* daylight spilling in — the way out is the brightest spot */}
      <mesh
        geometry={BOX}
        material={sharedLambert('#cfe8ff')}
        position={[0, 1.05, 0]}
        scale={[1.5, 2.1, 0.2]}
        raycast={noRaycast}
      />
      <pointLight color="#cfe8ff" intensity={0.9} distance={4} position={[0, 1.2, 0.4]} />
    </group>
  );
}

/**
 * The cave: a compact secondary map with its own local coordinate system.
 * Renders only while `map-cave` is the current map — the town scene is fully
 * unmounted by the parent, and nothing here touches outdoor state. Movement,
 * arrivals, hotspots and the quest loop reuse the same data-driven pieces as
 * the town: ANCHORS/EDGES (mapId-scoped), useWalker, Hotspot, QuestMarker.
 */
export function CaveWorld({
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
  attention,
  handleRef,
}: CaveWorldProps) {
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
    }),
    [walker, onArrive],
  );

  const walkHere = (anchor: AnchorId) => {
    walker.walkTo(anchor, () => {
      onArrive(anchor);
    });
  };

  const mouseAnchor = getAnchor(world, 'anchor-cave-mouse');
  const dx = walker.position.x - (mouseAnchor.x + 0.8);
  const dz = walker.position.z - mouseAnchor.z;
  const mouseFacing = Math.hypot(dx, dz) < 5 ? Math.atan2(dx, dz) : 0.6;

  return (
    <group>
      <EnvironmentLights env={environment} />

      {/* Cave floor doubles as the walk surface — taps resolve to anchors on
          this map only, so a tap can never path back to the town graph. */}
      <mesh
        geometry={FLOOR}
        material={sharedLambert('#5f586c')}
        rotation={[-Math.PI / 2, 0, 0]}
        name="ground"
        position={[0, 0, 0.4]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (!interactive || event.delta > 6) return;
          event.stopPropagation();
          const anchor = nearestWalkableAnchor(world, event.point.x, event.point.z, 4, MAP_ID);
          if (anchor) walkHere(anchor);
          else walker.faceToward(event.point.x, event.point.z);
        }}
      />

      {world.anchors
        .filter((anchor) => anchor.walkable && anchor.mapId === MAP_ID)
        .map((anchor) => (
          <mesh
            key={`path-${anchor.id}`}
            geometry={CIRCLE}
            material={sharedLambert('#7a7286')}
            scale={[1.1, 1.1, 1]}
            position={[anchor.x, 0.015, anchor.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={noRaycast}
          />
        ))}

      <CaveShell />
      <CavePool />
      <CrystalCluster />
      <ExitArchway world={world} />
      <CaveProps detailLevel={detailLevel} />

      {/* The way out: a tappable hotspot on the mouth anchor — arriving there
          resolves `transition-cave-exit` via the shared arrival handler. */}
      <Hotspot
        x={getAnchor(world, 'anchor-cave-mouth').x}
        z={getAnchor(world, 'anchor-cave-mouth').z}
        active={interactive}
        label="hotspot-exit"
        onSelect={() => walkHere('anchor-cave-mouth')}
      />

      {/* Quest hotspots follow the same rule as town: only quests that live
          on this map and whose area is visible mount anything. */}
      {QUEST_DEFINITIONS.map((quest) => {
        if ((quest.mapId ?? 'map-town') !== MAP_ID) return null;
        const anchor = getAnchorOrNull(world, quest.anchorId);
        if (!anchor) return null;
        if (!visibleAreas.includes(anchor.areaId)) return null;
        const status = questStatuses[quest.id];
        const active = interactive && status !== 'locked';
        return (
          <Hotspot
            key={quest.id}
            x={anchor.x}
            z={anchor.z}
            active={active}
            label={`hotspot-${quest.id}`}
            onSelect={() => walkHere(anchor.id)}
          />
        );
      })}

      {/* The cave mouse — the map's one resident. Rendered by the shared
          animal slot so a GLB model set supplies it too; grey tint reads
          "mouse", not "cat". */}
      <group
        position={[mouseAnchor.x + CAVE_MOUSE_OFFSET.x, 0, mouseAnchor.z + CAVE_MOUSE_OFFSET.z]}
      >
        {/* The mouse is a person too: a tap on the figure talks to it, and
            reaching its spot earns the same one-shot attention cue. */}
        <mesh
          position={[0, 0.6, 0]}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            if (!interactive || event.delta > 6) return;
            if (!onNpcTap) return;
            event.stopPropagation();
            onNpcTap('npc-cave-mouse');
          }}
        >
          {/* Critter-sized tap cylinder: sized to the little body, not the
              humanoid 0.9 — a wide invisible zone eats neighbouring ground
              taps and the child can't tell what they aimed at. */}
          <cylinderGeometry args={[0.45, 0.45, 1.4, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <CharacterReact
          npcId="npc-cave-mouse"
          nonce={attention?.npcId === 'npc-cave-mouse' ? attention.nonce : 0}
          context={attention?.context ?? 'notices-child'}
        >
          <group rotation={[0, mouseFacing, 0]}>
            <models.Animal variant="cat" tint="#8d8391" detailLevel={detailLevel} />
          </group>
        </CharacterReact>
      </group>

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
