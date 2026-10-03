import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  AnchorId,
  AvatarId,
  DiscoveryId,
  HeadwearId,
  LandmarkId,
  QuestId,
  QuestStatus,
} from '../domain/game/types.ts';
import { QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import type { AreaId } from '../domain/world/types.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { ANCHORS, EDGES, getAnchor } from './navigation/graph.ts';
import {
  NPC_DEFINITIONS,
  areaAt,
  areaForAnchor,
  npcFigureJitter,
  resolveNpcSpot,
  visibleAreaIds,
} from './registry.ts';
import { npcLook } from './npcLooks.ts';
import { GROUND_DECORATIONS } from './decorations.ts';
import {
  Detail,
  FlowerPatch,
  PathEdgeStones,
  StoneRoads,
  PlantCluster,
  StoneCluster,
} from './models/details.tsx';
import { BOX, CYLINDER, PLANE, sharedGroundMaterial, sharedLambert } from './models/shared.ts';
import { CharacterReact, Hotspot, type NpcAttention, type WorldSceneHandle } from './sceneBits.tsx';
import { nearestWalkableAnchor } from './navigation/pathfinding.ts';
import { noRaycast } from './models/raycast.ts';
import { useWalker } from './useWalker.ts';
import { useCritters } from './useCritters.ts';
import { publishCameraFocus } from './CameraRig.tsx';
import {
  AVATAR_VISUALS,
  LANDMARK_PALETTE,
  PROP_PALETTE,
  useModels,
  type DetailLevel,
  type LandmarkVisualVariant,
} from './models/modelProvider.ts';

export type HubHandle = WorldSceneHandle;

export interface HubProps {
  readonly avatarId: AvatarId;
  readonly headwear: HeadwearId;
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly completedCount: number;
  readonly interactive: boolean;
  /** Decorative density derived from the quality tier (0/1/2). */
  readonly detailLevel: DetailLevel;
  /** Anchor the avatar starts from on this map (spawn/restored position). */
  readonly startAnchorId: AnchorId;
  /** Persistent world facts — the revealed secret entrance swaps its look. */
  readonly discoveries: readonly DiscoveryId[];
  readonly onArrive: (anchor: AnchorId) => void;
  /** Tap a mounted NPC figure → talk to them where they currently stand. */
  readonly onNpcTap?: ((npcId: string) => void) | undefined;
  /** Coarse world clock driving NPC routines (ticks once per arrival). */
  readonly worldTime?: number | undefined;
  /** Who noticed the latest arrival — replays a one-shot cue per nonce. */
  readonly attention?: NpcAttention | null | undefined;
  readonly handleRef: Ref<HubHandle> | undefined;
}

/** Map domain landmark ids to presentation variants (model layer stays domain-free). */
function landmarkVariant(id: LandmarkId | null): LandmarkVisualVariant | undefined {
  switch (id) {
    case 'landmark-square':
      return 'square';
    case 'landmark-home-gate':
      return 'home-gate';
    case 'landmark-shop':
    case 'landmark-bakery':
      return 'shop';
    case 'landmark-garden':
    case 'landmark-park':
      return 'garden';
    case 'landmark-fountain':
    case 'landmark-river':
      return 'fountain';
    default:
      return undefined;
  }
}

const GROUND = new THREE.PlaneGeometry(40, 40);
const PATH_MATERIAL = new THREE.MeshLambertMaterial({ color: '#dcc79a' });
/**
 * The hidden cave entrance: an ordinary-looking park rock with a hairline
 * crack of warm light. Once discovered it stands open — a dark archway the
 * child can walk into. Tapping the rock itself counts as approaching it.
 */
function CaveEntranceRock({
  revealed,
  interactive,
  near,
  onApproach,
}: {
  readonly revealed: boolean;
  readonly interactive: boolean;
  /** Avatar is close enough to notice the secret — fires one shimmer. */
  readonly near: boolean;
  readonly onApproach: () => void;
}) {
  const rock = sharedLambert('#7d7a82');
  const dark = sharedLambert('#241f2e');
  const crackRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const shimmerT = useRef(0);
  const shimmerDone = useRef(false);
  const reduced = prefersReducedMotion();
  const invalidate = useThree((state) => state.invalidate);

  // frameloop="demand": waking `near` must invalidate explicitly, or the
  // flare would only tick while the avatar happens to still be walking.
  useEffect(() => {
    if (near && !revealed && !shimmerDone.current) invalidate();
  }, [near, revealed, invalidate]);

  // One-time ambient shimmer: the first time the child walks near the
  // undiscovered rock, the crack flares once and settles — attention without
  // a persistent pulsing beacon. Reduced motion keeps the wider crack only.
  useFrame((_, delta) => {
    if (!near || revealed || shimmerDone.current || !crackRef.current) return;
    invalidate();
    shimmerT.current = reduced ? 1 : Math.min(1, shimmerT.current + delta * 1.4);
    const flare = Math.sin(shimmerT.current * Math.PI);
    crackRef.current.scale.set(0.14 + 0.2 * flare, 0.9 + 0.55 * flare, 0.07);
    if (glowRef.current) glowRef.current.intensity = 1.6 * flare;
    if (shimmerT.current >= 1) shimmerDone.current = true;
  });

  const approach = (event: ThreeEvent<MouseEvent>) => {
    if (!interactive || event.delta > 6) return;
    event.stopPropagation();
    onApproach();
  };
  return (
    <group position={[-12.2, 0, 4.6]} name="cave-entrance" dispose={null}>
      {/* the rock itself — slightly apart from the walkable anchor in front */}
      <mesh
        geometry={BOX}
        material={rock}
        position={[0, 0.9, 0]}
        scale={[1.5, 1.8, 1.1]}
        rotation={[0, 0.4, 0.06]}
        onClick={approach}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert('#6f6c76')}
        position={[0.9, 0.55, 0.25]}
        scale={[0.8, 1.1, 0.8]}
        rotation={[0.1, -0.3, 0]}
        raycast={noRaycast}
      />
      {revealed ? (
        <>
          {/* open mouth: a dark doorway where the crack was */}
          <mesh
            geometry={BOX}
            material={dark}
            position={[-0.15, 0.62, 0.58]}
            scale={[0.62, 1.15, 0.12]}
            raycast={noRaycast}
            onClick={approach}
          />
          {/* warm shimmer inside — the cave glows softly, not quest-bright */}
          <pointLight color="#ffd9a0" intensity={0.8} distance={3.4} position={[-0.1, 0.7, 0.9]} />
        </>
      ) : (
        <>
          {/* the clue: a warm crack on the camera-facing corner of the
              rock (camera looks along (1,1,1)), rotated with the boulder so
              it stays proud of the face — wide enough to notice up close */}
          <mesh
            ref={crackRef}
            geometry={BOX}
            material={sharedLambert('#ffd9a0')}
            position={[0.24, 0.6, 0.55]}
            rotation={[0, 0.4, 0]}
            scale={[0.14, 0.9, 0.07]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={sharedLambert('#ffd9a0')}
            position={[0.74, 0.55, 0.3]}
            rotation={[0, 0.4, 0]}
            scale={[0.07, 0.7, 0.14]}
            raycast={noRaycast}
          />
          {/* lit only during the one-time shimmer; sits idle at 0 otherwise */}
          <pointLight
            ref={glowRef}
            color="#ffd9a0"
            intensity={0}
            distance={2.6}
            position={[-0.15, 0.6, 0.9]}
          />
        </>
      )}
    </group>
  );
}

/**
 * Progress keepsake: the neighbourhood tree grows with each completed chapter.
 * Explicit refs (not group.children indices) so decorative children can be
 * added freely; `completedCount` remains the only progression input and the
 * existing easing/invalidate contract is unchanged.
 */
function KeepsakeTree({
  completedCount,
  detailLevel,
}: {
  readonly completedCount: number;
  readonly detailLevel: DetailLevel;
}) {
  const trunkRef = useRef<THREE.Mesh>(null);
  const canopyRef = useRef<THREE.Group>(null);
  const growth = useRef(completedCount);
  const reducedMotion = prefersReducedMotion();
  const invalidate = useThree((state) => state.invalidate);

  useFrame((_, delta) => {
    const current = growth.current;
    if (current === completedCount || !trunkRef.current || !canopyRef.current) return;
    // Demand-rendered canvas: keep invalidating until the grow settles.
    invalidate();
    if (reducedMotion) {
      growth.current = completedCount;
    } else {
      const direction = Math.sign(completedCount - current);
      const next = current + direction * Math.min(Math.abs(completedCount - current), delta * 1.6);
      growth.current = next;
    }
    const shown = growth.current;
    const trunk = 0.3 + shown * 0.35;
    const canopy = 0.7 + shown * 0.18;
    const bounce =
      !reducedMotion && Math.abs(completedCount - shown) > 0.02
        ? 1 + Math.abs(completedCount - shown) * 0.35
        : 1;
    trunkRef.current.scale.set(0.3, trunk, 0.3);
    trunkRef.current.position.y = trunk / 2;
    canopyRef.current.scale.set(canopy * bounce, 0.5 * bounce, canopy * bounce);
    canopyRef.current.position.y = trunk + 0.22;
  });

  const trunk = 0.3 + completedCount * 0.35;
  const canopy = 0.7 + completedCount * 0.18;
  // Blossoms are a progression cue: one per completed chapter (4 quests).
  const blossoms = Math.min(completedCount, 4);

  return (
    // dispose={null}: this subtree uses only module-level shared resources.
    <group position={[-1.2, 0, 1.6]} name="keepsake" dispose={null}>
      <mesh
        ref={trunkRef}
        position={[0, trunk / 2, 0]}
        scale={[0.3, trunk, 0.3]}
        geometry={CYLINDER}
        material={sharedLambert('#8a5a33')}
        raycast={noRaycast}
      />
      <Detail level={detailLevel} min={2}>
        {/* two branch tiers peeking out of the canopy */}
        <mesh
          geometry={BOX}
          material={sharedLambert('#8a5a33')}
          position={[0.22, trunk * 0.72, 0]}
          rotation={[0, 0, -0.6]}
          scale={[0.34, 0.08, 0.08]}
          raycast={noRaycast}
        />
        <mesh
          geometry={BOX}
          material={sharedLambert('#8a5a33')}
          position={[-0.2, trunk * 0.55, -0.08]}
          rotation={[0, 0.4, 0.55]}
          scale={[0.3, 0.07, 0.07]}
          raycast={noRaycast}
        />
      </Detail>
      <group ref={canopyRef} position={[0, trunk + 0.22, 0]} scale={[canopy, 0.5, canopy]}>
        <mesh geometry={BOX} material={sharedLambert('#4f8f4f')} raycast={noRaycast} />
        <Detail level={detailLevel} min={1}>
          {/* satellite leaf clusters (scale along with the canopy group) */}
          <mesh
            geometry={BOX}
            material={sharedLambert('#3f743f')}
            position={[0.55, 0.1, 0.3]}
            scale={[0.5, 0.6, 0.5]}
            raycast={noRaycast}
          />
          <mesh
            geometry={BOX}
            material={sharedLambert('#5d9c5d')}
            position={[-0.5, 0.2, -0.35]}
            scale={[0.45, 0.55, 0.45]}
            raycast={noRaycast}
          />
          {/* blossoms: one per completed chapter — progression cue */}
          {Array.from({ length: blossoms }, (_, i) => (
            <mesh
              key={i}
              geometry={BOX}
              material={sharedLambert('#e88bb0')}
              position={[0.3 - i * 0.3, 0.62, 0.35 - i * 0.2]}
              scale={[0.14, 0.14, 0.14]}
              raycast={noRaycast}
            />
          ))}
        </Detail>
        <Detail level={detailLevel} min={2}>
          <mesh
            geometry={BOX}
            material={sharedLambert('#5d9c5d')}
            position={[0.1, 0.55, -0.5]}
            scale={[0.4, 0.4, 0.4]}
            raycast={noRaycast}
          />
        </Detail>
      </group>
      <Detail level={detailLevel} min={1}>
        {/* planter ring at the base */}
        <StoneCluster position={[0.55, 0, 0.2]} scale={0.8} />
        <StoneCluster position={[-0.5, 0, -0.35]} scale={0.7} />
      </Detail>
      <Detail level={detailLevel} min={2}>
        <FlowerPatch position={[-0.55, 0, 0.45]} scale={0.7} />
      </Detail>
    </group>
  );
}

export function Hub({
  avatarId,
  headwear,
  questStatuses,
  completedCount,
  interactive,
  detailLevel,
  startAnchorId,
  discoveries,
  onArrive,
  onNpcTap,
  worldTime = 0,
  attention,
  handleRef,
}: HubProps) {
  const models = useModels();
  const walker = useWalker(startAnchorId, onArrive, interactive);
  // The follow-camera reads the avatar's live position from this shared
  // store — same useWalker source of truth, never a second copy.
  useEffect(() => {
    publishCameraFocus(walker.position.x, walker.position.z);
  });
  // Ambient critters: motion only while the world is interactive and motion
  // is allowed; on low tier they render as static silhouettes.
  const critters = useCritters(interactive && !prefersReducedMotion(), detailLevel);

  // Area-based activation: the area the avatar currently stands in plus the
  // areas one waypoint-hop away are "visible". NPCs outside this set are data
  // in memory only — no React subtree, no animation work — so the NPC count
  // can grow without growing per-frame work.
  const activeAreaId: AreaId = areaForAnchor(walker.at);
  const visibleAreas = visibleAreaIds(activeAreaId);
  // The world clock lives in App (it also picks who answers on arrival);
  // `worldTime` is a pure prop here. Each arrival ticks once, so scheduled
  // NPCs advance through their spots as the world is travelled —
  // event-driven, never a per-frame clock, never a function of where the
  // player stands.
  const inVisibleArea = (x: number, z: number) => {
    const areaId = areaAt(x, z);
    return areaId !== null && visibleAreas.includes(areaId);
  };
  // Proximity cue for the secret: the rock shimmers once when the child
  // wanders close — discoverable by exploration, not by a marker.
  const playerAnchor = getAnchor(walker.at);
  const entranceAnchor = getAnchor('anchor-cave-entrance');
  const nearEntrance =
    Math.hypot(playerAnchor.x - entranceAnchor.x, playerAnchor.z - entranceAnchor.z) < 4.5;
  useImperativeHandle(
    handleRef,
    () => ({
      goTo: (anchor, onArrived) => {
        const walked = walker.walkTo(anchor, () => {
          // Arrival side effects (sound, first-use hint) always run; the
          // caller's callback (e.g. opening the quest dialogue) runs on top.
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
      // Tapping the world is a full interaction: the shared arrival handler
      // decides who noticed and what (if anything) opens.
      onArrive(anchor);
    });
  };

  return (
    <group>
      <hemisphereLight args={['#fdf6e8', '#c8b78f', 1.0]} />
      <directionalLight color="#ffe3b8" position={[6, 10, 4]} intensity={0.9} />
      <directionalLight color="#bcd8f0" position={[-5, 8, -6]} intensity={0.25} />

      {/* Ground doubles as the walk surface: taps resolve to the nearest anchor. */}
      <mesh
        geometry={GROUND}
        material={sharedGroundMaterial()}
        rotation={[-Math.PI / 2, 0, 0]}
        name="ground"
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (!interactive || event.delta > 6) return;
          event.stopPropagation();
          const anchor = nearestWalkableAnchor(event.point.x, event.point.z, 4, 'map-town');
          if (anchor) walkHere(anchor);
        }}
      />

      {ANCHORS.filter((anchor) => anchor.walkable && anchor.mapId === 'map-town').map((anchor) => (
        <mesh
          key={`path-${anchor.id}`}
          geometry={GROUND}
          material={PATH_MATERIAL}
          scale={[0.045, 0.045, 1]}
          position={[anchor.x, 0.01, anchor.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={noRaycast}
        />
      ))}

      {/* Landmarks come from anchor data — one row per landmark anchor,
          visible only while its area participates in rendering. */}
      {ANCHORS.filter(
        (anchor) => anchor.landmarkId !== null && visibleAreas.includes(anchor.areaId),
      ).map((anchor) => (
        <models.Landmark
          key={anchor.landmarkId}
          position={{ x: anchor.x, z: anchor.z - 1.2 }}
          palette={LANDMARK_PALETTE}
          detailLevel={detailLevel}
          variant={landmarkVariant(anchor.landmarkId)}
        />
      ))}

      {/* Quest hotspots follow the same activation rule as NPCs: outside the
          visible areas nothing mounts — no Hotspot subtree, no useFrame pulse —
          so interaction cost scales with visible content, not quest count. */}
      {QUEST_DEFINITIONS.map((quest) => {
        if ((quest.mapId ?? 'map-town') !== 'map-town') return null;
        const anchor = getAnchor(quest.anchorId as AnchorId);
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

      {/* NPCs are data-driven: one row in NPC_DEFINITIONS + one row in
          NPC_LOOKS is a whole character. Only NPCs currently standing in a
          visible area mount a figure — schedules resolve standpoints as a
          deterministic function of world time, so idle NPCs cost
          nothing and `frameloop="demand"` is untouched. */}
      {NPC_DEFINITIONS.map((npc) => {
        const spot = resolveNpcSpot(npc, worldTime);
        const anchor = getAnchor(spot?.anchorId ?? npc.anchorId);
        if (!visibleAreas.includes(anchor.areaId)) return null;
        if (anchor.mapId !== 'map-town') return null;
        const jitter = npcFigureJitter(npc.id);
        const npcX = anchor.x + 0.9 + (spot?.offsetX ?? 0) + jitter.x;
        const npcZ = anchor.z - 0.4 + (spot?.offsetZ ?? 0) + jitter.z;
        const dx = walker.position.x - npcX;
        const dz = walker.position.z - npcZ;
        // Neighbours turn to watch the player approach: attention is feedback.
        // From afar they keep the pose authored on their routine spot.
        const facing = Math.hypot(dx, dz) < 6 ? Math.atan2(dx, dz) : (spot?.facing ?? 0);
        const look = npcLook(npc.id);
        return (
          <group key={npc.id}>
            {/* Invisible-but-tappable hit cylinder: a tap on the person
                talks to them where they stand. Generous radius — small
                fingers, and the figure itself reads as the target. */}
            <mesh
              position={[npcX, 0.75, npcZ]}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                if (!interactive || event.delta > 6) return;
                event.stopPropagation();
                onNpcTap?.(npc.id);
              }}
            >
              <cylinderGeometry args={[0.9, 0.9, 2.2, 8]} />
              <meshBasicMaterial visible={false} />
            </mesh>
            {/* Reaching an NPC earns CharacterReact(notices-child); tapping
                the figure earns CharacterReact(greets-child) in parallel with
                the walk/dialogue — never a marker or a gated sequence. */}
            <group position={[npcX, 0, npcZ]}>
              <CharacterReact
                npcId={npc.id}
                nonce={attention?.npcId === npc.id ? attention.nonce : 0}
                context={attention?.context ?? 'notices-child'}
                armColor={look.palette.limb}
              >
                <models.Figure
                  position={{ x: 0, z: 0 }}
                  rotationY={facing}
                  palette={look.palette}
                  hairStyle={look.hairStyle}
                  hairColor={look.hairColor}
                  label={npc.id}
                  detailLevel={detailLevel}
                  role={look.role}
                />
              </CharacterReact>
            </group>
            {spot?.prop ? (
              <models.Prop
                position={{
                  x: npcX + (spot.propOffsetX ?? 0),
                  z: npcZ + (spot.propOffsetZ ?? 0),
                }}
                palette={PROP_PALETTE}
                variant={spot.prop}
                detailLevel={detailLevel}
              />
            ) : null}
          </group>
        );
      })}

      <models.Prop
        position={{ x: 1.4, z: 1.2 }}
        palette={PROP_PALETTE}
        shape="cylinder"
        variant="planter"
        detailLevel={detailLevel}
      />
      <models.Prop
        position={{ x: -1.5, z: -1.1 }}
        palette={PROP_PALETTE}
        variant="basket"
        detailLevel={detailLevel}
      />
      <models.Prop
        position={{ x: 4.6, z: 1.4 }}
        palette={PROP_PALETTE}
        variant="crate"
        detailLevel={detailLevel}
      />

      {/* The park's secret: an ordinary rock with a thin warm crack. Once the
          child has reached it the crack becomes a lit doorway — a persisted
          discovery, never a labelled "enter" button. */}
      <CaveEntranceRock
        revealed={discoveries.includes('discovery-cave-entrance')}
        interactive={interactive}
        near={nearEntrance}
        onApproach={() => walkHere('anchor-cave-entrance')}
      />

      {/* Visual path decoration derived from EDGES — read-only, never alters
          anchors, pathfinding, or movement. The cobbled road is meaning (it
          marks where the child can walk), so it is never detail-gated; the
          curb stones beside it stay decorative. dispose={null}: this block
          and the authored GROUND_DECORATIONS below consume only module-level
          shared resources, so canvas remounts must not dispose them. */}
      <group dispose={null}>
        <StoneRoads
          edges={EDGES.filter((edge) => getAnchor(edge.from).mapId === 'map-town').map((edge) => ({
            from: getAnchor(edge.from),
            to: getAnchor(edge.to),
          }))}
        />
        <Detail level={detailLevel} min={1}>
          {EDGES.filter((edge) => getAnchor(edge.from).mapId === 'map-town').map((edge) => (
            <PathEdgeStones
              key={`${edge.from}-${edge.to}`}
              from={getAnchor(edge.from)}
              to={getAnchor(edge.to)}
              count={detailLevel >= 2 ? 6 : 4}
            />
          ))}
        </Detail>

        {/* Fixed authored ground decoration (decorations.ts validates every slot
          against anchors, NPCs, landmarks, props and path corridors). */}
        {GROUND_DECORATIONS.map((slot, i) =>
          detailLevel >= slot.minDetail && inVisibleArea(slot.x, slot.z) ? (
            slot.kind === 'flower' ? (
              <FlowerPatch key={i} position={[slot.x, 0, slot.z]} scale={slot.scale} />
            ) : slot.kind === 'stone' ? (
              <StoneCluster key={i} position={[slot.x, 0, slot.z]} scale={slot.scale} />
            ) : slot.kind === 'plant' ? (
              <PlantCluster key={i} position={[slot.x, 0, slot.z]} scale={slot.scale} />
            ) : (
              <mesh
                key={i}
                geometry={PLANE}
                material={sharedLambert('#e2cfa4')}
                position={[slot.x, 0.005, slot.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={[slot.scale ?? 2, slot.scale ?? 2, 1]}
                raycast={noRaycast}
              />
            )
          ) : null,
        )}
      </group>

      <KeepsakeTree completedCount={completedCount} detailLevel={detailLevel} />

      {/* Ambient animals: transforms are ref-driven by useCritters — the group
          has no position prop so React never overwrites animated placement. */}
      <group dispose={null}>
        {critters.map((critter) => (
          <group key={critter.key} ref={critter.register} raycast={noRaycast}>
            <models.Animal
              variant={critter.kind}
              tint={critter.tint}
              moving={critter.moving}
              detailLevel={detailLevel}
            />
          </group>
        ))}
      </group>

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
