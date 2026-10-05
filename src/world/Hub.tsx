import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
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
import type { WorldSource } from '../domain/world/source.ts';
import type { AreaId } from '../domain/world/types.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { getAnchor, getAnchorOrNull } from './navigation/graph.ts';
import {
  areaAt,
  areaForAnchor,
  npcFigureJitter,
  resolveNpcStand,
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
import {
  CharacterReact,
  Hotspot,
  TAP_ONLY_MATERIAL,
  type NpcAttention,
  type WorldSceneHandle,
} from './sceneBits.tsx';
import { nearestWalkableAnchor } from './navigation/pathfinding.ts';
import { noRaycast } from './models/raycast.ts';
import { caveEntranceRockPosition, landmarkPosition, NPC_STAND_OFFSET } from './placement.ts';
import { useWalker } from './useWalker.ts';
import { useCritters } from './useCritters.ts';
import { FOUNTAIN_BASIN } from './critters.ts';
import { HIDDEN_FINDS } from './decorations.ts';
import { HiddenFind, ReactionRipple, ReactiveProp } from './reactionBits.tsx';
import { AvatarLiveliness, IdleFlourish } from './livelinessBits.tsx';
import { activityPoseFor, idleCueFor } from './liveliness.ts';
import { resolveNpcActivity } from './registry.ts';
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
  /** World data — the static source in the game, a document source in the
      World Builder preview. */
  readonly world: WorldSource;
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
  /**
   * Arrival identity: increments exactly once per avatar arrival. Every
   * arrival-triggered behaviour keys off it, so a given arrival produces at
   * most one flourish per target regardless of rerenders, dwell, or demand
   * renders.
   */
  readonly arrivalNonce?: number | undefined;
  /** Session-only find memory — owned by the caller (App) because this
      component remounts on every map transition. Omitted in preview
      contexts (World Builder): finds just stay covered. */
  readonly revealedFinds?: ReadonlySet<string> | undefined;
  readonly onRevealFind?: ((findId: string) => void) | undefined;
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
  position,
}: {
  readonly revealed: boolean;
  readonly interactive: boolean;
  /** Avatar is close enough to notice the secret — fires one shimmer. */
  readonly near: boolean;
  readonly onApproach: () => void;
  /** Anchor-derived render position (`caveEntranceRockPosition`). */
  readonly position: readonly [number, number, number];
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
    <group position={position} name="cave-entrance" dispose={null}>
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
  world,
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
  arrivalNonce = 0,
  revealedFinds,
  onRevealFind,
  handleRef,
}: HubProps) {
  const models = useModels();
  const walker = useWalker(world, startAnchorId, onArrive, interactive);
  // The follow-camera reads the avatar's live position from this shared
  // store — same useWalker source of truth, never a second copy.
  useEffect(() => {
    publishCameraFocus(walker.focus.x, walker.focus.z);
  });
  // Ambient critters: motion only while the world is interactive and motion
  // is allowed; on low tier they render as static silhouettes.
  // Fountain tap: a bloop + ripple, and the fish dart away from the touch —
  // the micro-story "the fish noticed me". Nonce-keyed: one dart per tap.
  const [fishDart, setFishDart] = useState({ nonce: 0, x: 0, z: 0 });
  // Arrival → nearby cats: same nonce contract as NPC attention — one
  // notice/follow per completed arrival, position snapshotted at settle.
  const catNotice = useMemo(
    () => ({ nonce: arrivalNonce, x: walker.position.x, z: walker.position.z }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arrivalNonce],
  );
  const critters = useCritters(
    interactive && !prefersReducedMotion(),
    detailLevel,
    fishDart,
    catNotice,
  );
  // Area-based activation: the area the avatar currently stands in plus the
  // areas one waypoint-hop away are "visible". NPCs outside this set are data
  // in memory only — no React subtree, no animation work — so the NPC count
  // can grow without growing per-frame work.
  const activeAreaId: AreaId = areaForAnchor(world, walker.at);
  const visibleAreas = visibleAreaIds(world, activeAreaId);
  // The world clock lives in App (it also picks who answers on arrival);
  // `worldTime` is a pure prop here. Each arrival ticks once, so scheduled
  // NPCs advance through their spots as the world is travelled —
  // event-driven, never a per-frame clock, never a function of where the
  // player stands.
  const inVisibleArea = (x: number, z: number) => {
    const areaId = areaAt(world, x, z);
    return areaId !== null && visibleAreas.includes(areaId);
  };

  // Mounted NPC figures, resolved once per render — the glance target lookup
  // reads this same list (one pass, no per-frame nearest-NPC search).
  const npcFigures = world.npcDefinitions.flatMap((npc, index) => {
    const stand = resolveNpcStand(world, npc, worldTime);
    const spot = stand.spot;
    const anchor = getAnchorOrNull(world, stand.anchorId);
    if (!anchor) return [];
    if (!visibleAreas.includes(anchor.areaId)) return [];
    if (anchor.mapId !== 'map-town') return [];
    const jitter = npcFigureJitter(world, npc.id);
    const npcX = anchor.x + NPC_STAND_OFFSET.x + stand.offsetX + jitter.x;
    const npcZ = anchor.z + NPC_STAND_OFFSET.z + stand.offsetZ + jitter.z;
    const dx = walker.position.x - npcX;
    const dz = walker.position.z - npcZ;
    // Neighbours turn to watch the player approach: attention is feedback.
    // From afar they keep the pose authored on their routine spot.
    const facing = Math.hypot(dx, dz) < 6 ? Math.atan2(dx, dz) : (spot?.facing ?? 0);
    const look = npcLook(npc.id);
    const cue = idleCueFor(index, worldTime);
    return [
      {
        npc,
        spot,
        npcX,
        npcZ,
        facing,
        look,
        // Critters have no face-eye meshes — a head-dip reads as the same
        // beat; the flourish falls back automatically.
        cue,
        pose: activityPoseFor(resolveNpcActivity(npc, worldTime)),
      },
    ];
  });

  // Avatar glance: the look-target is resolved at the settle render —
  // renders are event-driven, so this is one lookup per arrival, never a
  // per-frame nearest-NPC search. Nearest mounted NPC figure within a short
  // radius wins; nobody nearby → no glance.
  const glanceHeading = useMemo(() => {
    if (arrivalNonce === 0 || walker.moving) return null;
    let best: number | null = null;
    let bestDist = 3.5;
    const px = walker.position.x;
    const pz = walker.position.z;
    for (const figure of npcFigures) {
      const dx = figure.npcX - px;
      const dz = figure.npcZ - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = Math.atan2(dx, dz);
      }
    }
    return best;
    // npcFigures is rebuilt every render — deliberately not a dep: the
    // settled position at this arrival is the only snapshot the glance uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalNonce, walker.moving, walker.position.x, walker.position.z]);
  // Proximity cue for the secret: the rock shimmers once when the child
  // wanders close — discoverable by exploration, not by a marker.
  const playerAnchor = getAnchor(world, walker.at);
  const entranceAnchor = getAnchorOrNull(world, 'anchor-cave-entrance');
  const nearEntrance =
    entranceAnchor !== null &&
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
          const anchor = nearestWalkableAnchor(world, event.point.x, event.point.z, 4, 'map-town');
          if (
            import.meta.env.DEV ||
            (window as unknown as Record<string, unknown>)['__WORLD_PROBE']
          ) {
            (window as unknown as Record<string, unknown>)['__worldLastTap'] = {
              x: event.point.x,
              z: event.point.z,
              resolved: anchor,
            };
          }
          if (anchor) walkHere(anchor);
          else walker.faceToward(event.point.x, event.point.z);
        }}
      />

      {world.anchors
        .filter((anchor) => anchor.walkable && anchor.mapId === 'map-town')
        .map((anchor) => (
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
      {world.anchors
        .filter((anchor) => anchor.landmarkId !== null && visibleAreas.includes(anchor.areaId))
        .map((anchor) => {
          const pos = landmarkPosition(anchor);
          return anchor.landmarkId === 'landmark-fountain' ? (
            /* The reactive tap surface sits ON the landmark's derived
               position — the drawn basin and the fish's FOUNTAIN_BASIN are
               the same disc — so one touch answers with bloop + ripple +
               fish dart. */
            <ReactiveProp
              key={anchor.landmarkId}
              reaction="bloop"
              subject="fountain"
              enabled={interactive}
              position={[pos.x, 0, pos.z]}
              radius={1.0}
              onReact={(point) =>
                setFishDart((dart) => ({ nonce: dart.nonce + 1, x: point.x, z: point.z }))
              }
            >
              {(nonce) => (
                <>
                  <models.Landmark
                    position={{ x: 0, z: 0 }}
                    palette={LANDMARK_PALETTE}
                    detailLevel={detailLevel}
                    variant={landmarkVariant(anchor.landmarkId)}
                  />
                  <ReactionRipple nonce={nonce} y={FOUNTAIN_BASIN.waterY} />
                </>
              )}
            </ReactiveProp>
          ) : (
            <models.Landmark
              key={anchor.landmarkId}
              position={pos}
              palette={LANDMARK_PALETTE}
              detailLevel={detailLevel}
              variant={landmarkVariant(anchor.landmarkId)}
            />
          );
        })}

      {/* Quest hotspots follow the same activation rule as NPCs: outside the
          visible areas nothing mounts — no Hotspot subtree, no useFrame pulse —
          so interaction cost scales with visible content, not quest count. */}
      {QUEST_DEFINITIONS.map((quest) => {
        if ((quest.mapId ?? 'map-town') !== 'map-town') return null;
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

      {/* NPCs are data-driven: one row in NPC_DEFINITIONS + one row in
          NPC_LOOKS is a whole character. Only NPCs currently standing in a
          visible area mount a figure — schedules resolve standpoints as a
          deterministic function of world time, so idle NPCs cost
          nothing and `frameloop="demand"` is untouched. */}
      {npcFigures.map(({ npc, spot, npcX, npcZ, facing, look, cue, pose }) => {
        return (
          <group key={npc.id}>
            {/* Invisible-but-tappable hit cylinder: a tap on the person
                talks to them where they stand. Generous radius — small
                fingers, and the figure itself reads as the target. Critters
                get a smaller cylinder sized to the little body: a humanoid
                radius around a roaming mouse eats world taps and launches
                battles the child never aimed at. */}
            <mesh
              position={[npcX, 0.75, npcZ]}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                if (!interactive || event.delta > 6) return;
                if (!onNpcTap) return;
                event.stopPropagation();
                onNpcTap(npc.id);
              }}
            >
              <cylinderGeometry
                args={[
                  npc.archetype === 'critter' ? 0.45 : 0.9,
                  npc.archetype === 'critter' ? 0.45 : 0.9,
                  2.2,
                  8,
                ]}
              />
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
                {/* Presentation liveliness lives inside the semantic wrapper
                    deliberately: idle cues and the held activity pose are
                    uninstrumented polish — `worldTime` is the tick trigger,
                    never a permanent loop. */}
                <IdleFlourish nonce={worldTime} cue={cue} pose={pose}>
                  {/* Critters (the fountain mouse) take the animal slot like the
                      cave mouse; people take the humanoid figure. Same tap,
                      same attention cue — only the body differs. */}
                  {npc.archetype === 'critter' ? (
                    <group rotation={[0, facing, 0]}>
                      <models.Animal
                        variant="cat"
                        tint={look.palette.body}
                        detailLevel={detailLevel}
                      />
                    </group>
                  ) : (
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
                  )}
                </IdleFlourish>
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
      {entranceAnchor ? (
        <CaveEntranceRock
          revealed={discoveries.includes('discovery-cave-entrance')}
          interactive={interactive}
          near={nearEntrance}
          onApproach={() => walkHere('anchor-cave-entrance')}
          position={[
            caveEntranceRockPosition(entranceAnchor).x,
            0,
            caveEntranceRockPosition(entranceAnchor).z,
          ]}
        />
      ) : null}

      {/* Visual path decoration derived from EDGES — read-only, never alters
          anchors, pathfinding, or movement. The cobbled road is meaning (it
          marks where the child can walk), so it is never detail-gated; the
          curb stones beside it stay decorative. dispose={null}: this block
          and the authored GROUND_DECORATIONS below consume only module-level
          shared resources, so canvas remounts must not dispose them. */}
      <group dispose={null}>
        <StoneRoads
          edges={world.edges
            .filter((edge) => getAnchorOrNull(world, edge.from)?.mapId === 'map-town')
            .flatMap((edge) => {
              const from = getAnchorOrNull(world, edge.from);
              const to = getAnchorOrNull(world, edge.to);
              return from && to ? [{ from, to }] : [];
            })}
        />
        <Detail level={detailLevel} min={1}>
          {world.edges
            .filter((edge) => getAnchorOrNull(world, edge.from)?.mapId === 'map-town')
            .flatMap((edge) => {
              const from = getAnchorOrNull(world, edge.from);
              const to = getAnchorOrNull(world, edge.to);
              return from && to
                ? [
                    <PathEdgeStones
                      key={`${edge.from}-${edge.to}`}
                      from={from}
                      to={to}
                      count={detailLevel >= 2 ? 6 : 4}
                    />,
                  ]
                : [];
            })}
        </Detail>

        {/* Fixed authored ground decoration (decorations.ts validates every slot
          against anchors, NPCs, landmarks, props and path corridors). */}
        {GROUND_DECORATIONS.map((slot, i) =>
          detailLevel >= slot.minDetail && inVisibleArea(slot.x, slot.z) ? (
            slot.kind === 'flower' ? (
              <ReactiveProp
                key={i}
                reaction="bend"
                subject={`flower-${i}`}
                enabled={interactive}
                position={[slot.x, 0, slot.z]}
                radius={0.55}
              >
                <FlowerPatch position={[0, 0, 0]} scale={slot.scale} />
              </ReactiveProp>
            ) : slot.kind === 'stone' ? (
              <StoneCluster key={i} position={[slot.x, 0, slot.z]} scale={slot.scale} />
            ) : slot.kind === 'plant' ? (
              <ReactiveProp
                key={i}
                reaction="sway"
                subject={`plant-${i}`}
                enabled={interactive}
                position={[slot.x, 0, slot.z]}
                radius={0.55}
              >
                <PlantCluster position={[0, 0, 0]} scale={slot.scale} />
              </ReactiveProp>
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

      {/* Micro-discoveries: leaf piles hiding tiny finds — one bounded
          physical uncover each, then the revealed state stays for the
          session. No text, no marker, no counter. */}
      {HIDDEN_FINDS.map((find) => (
        <HiddenFind
          key={find.id}
          subject={find.id}
          position={[find.x, 0, find.z]}
          revealed={revealedFinds?.has(find.id) ?? false}
          enabled={interactive}
          onReveal={() => onRevealFind?.(find.id)}
        />
      ))}

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
            {/* Bird tap surface inside the critter's own moving node — it
                follows the bird wherever it perches. No stopPropagation:
                the touch also reaches the ground, so the child walks over
                while the bird flutters to its next perch. */}
            {critter.startle && (
              <mesh
                name={`tap-${critter.key}`}
                position={[0, 0.15, 0]}
                material={TAP_ONLY_MATERIAL}
                onClick={(event: ThreeEvent<MouseEvent>) => {
                  if (!interactive || event.delta > 6) return;
                  critter.startle?.();
                }}
              >
                <sphereGeometry args={[0.55, 8, 8]} />
              </mesh>
            )}
          </group>
        ))}
      </group>

      {/* Avatar arrival flourish: one bounded settle → glance → blink chain
          per arrivalNonce — presentation only, uninstrumented, quiet again
          when it ends. */}
      <AvatarLiveliness arrivalNonce={arrivalNonce} glanceHeading={glanceHeading}>
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
      </AvatarLiveliness>
    </group>
  );
}
