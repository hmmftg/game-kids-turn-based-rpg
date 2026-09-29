import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type {
  AnchorId,
  AvatarId,
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
  resolveNpcAnchor,
  visibleAreaIds,
} from './registry.ts';
import { npcLook } from './npcLooks.ts';
import { GROUND_DECORATIONS } from './decorations.ts';
import {
  Detail,
  FlowerPatch,
  PathEdgeStones,
  PlantCluster,
  StoneCluster,
} from './models/details.tsx';
import { BOX, CYLINDER, PLANE, sharedGroundMaterial, sharedLambert } from './models/shared.ts';
import { nearestWalkableAnchor } from './navigation/pathfinding.ts';
import { noRaycast } from './models/raycast.ts';
import { useWalker } from './useWalker.ts';
import { useCritters } from './useCritters.ts';
import { questEmoji } from '../ui/child/emoji.ts';
import {
  AVATAR_VISUALS,
  LANDMARK_PALETTE,
  PROP_PALETTE,
  useModels,
  type DetailLevel,
  type LandmarkVisualVariant,
} from './models/modelProvider.ts';

export interface HubHandle {
  /**
   * Walk to an anchor from a DOM action button (the accessible alternative to
   * tapping). Returns false when walking is not possible right now. `onArrive`,
   * when given, runs once the avatar reaches the anchor.
   */
  readonly goTo: (anchor: AnchorId, onArrive?: () => void) => boolean;
  readonly cancel: () => void;
}

export interface HubProps {
  readonly avatarId: AvatarId;
  readonly headwear: HeadwearId;
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly completedCount: number;
  readonly interactive: boolean;
  /** Decorative density derived from the quality tier (0/1/2). */
  readonly detailLevel: DetailLevel;
  /** The quest the objective chip currently points at, if any. */
  readonly suggestedQuestId: QuestId | null;
  readonly onArrive: (anchor: AnchorId) => void;
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
const HOTSPOT_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#e08a3c',
  transparent: true,
  opacity: 0.55,
});
const DESTINATION_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#2f6f4f',
  transparent: true,
  opacity: 0.6,
});
const SUGGESTED_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#e8a400',
  transparent: true,
  opacity: 0.75,
});

/** Pulsing ring that marks an interactive anchor; also the only clickable geometry. */
function Hotspot({
  x,
  z,
  active,
  suggested,
  onSelect,
  label,
}: {
  readonly x: number;
  readonly z: number;
  readonly active: boolean;
  /** Strongest affordance: this hotspot is where the current objective lives. */
  readonly suggested: boolean;
  readonly onSelect: () => void;
  readonly label: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const reduced = prefersReducedMotion();

  useFrame((frameState) => {
    if (!ref.current || !active || reduced) return;
    const amplitude = suggested ? 0.16 : 0.1;
    const pulse = 1 + Math.sin(frameState.clock.elapsedTime * 2.4) * amplitude;
    ref.current.scale.set(pulse, pulse, pulse);
  });

  return (
    <mesh
      ref={ref}
      name={label}
      position={[x, 0.03, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={suggested ? SUGGESTED_MATERIAL : HOTSPOT_MATERIAL}
      visible={active}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (active) onSelect();
      }}
    >
      <ringGeometry args={[0.5, suggested ? 0.9 : 0.78, 20]} />
    </mesh>
  );
}

/** Destination marker shown at the walk target until the avatar arrives. */
function DestinationMarker({ x, z }: { readonly x: number; readonly z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const reduced = prefersReducedMotion();

  useFrame((frameState) => {
    if (!ref.current) return;
    if (reduced) {
      ref.current.scale.set(1, 1, 1);
      return;
    }
    const pulse = 0.9 + Math.sin(frameState.clock.elapsedTime * 4) * 0.1;
    ref.current.scale.set(pulse, pulse, pulse);
  });

  return (
    <mesh
      ref={ref}
      name="walk-destination"
      position={[x, 0.04, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={DESTINATION_MATERIAL}
      raycast={noRaycast}
    >
      <ringGeometry args={[0.3, 0.5, 20]} />
    </mesh>
  );
}

/** Floating emoji above an interactable anchor — «I can tap this» cue. */
function QuestMarker({
  x,
  z,
  emoji,
  suggested,
}: {
  readonly x: number;
  readonly z: number;
  readonly emoji: string;
  readonly suggested: boolean;
}) {
  return (
    <Html
      position={[x, 1.9, z]}
      center
      distanceFactor={suggested ? 9 : 11}
      style={{ pointerEvents: 'none' }}
      zIndexRange={[5, 0]}
    >
      <div
        className={`world-marker${suggested ? ' world-marker--current' : ''}`}
        aria-hidden="true"
      >
        {emoji}
      </div>
    </Html>
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
  suggestedQuestId,
  onArrive,
  handleRef,
}: HubProps) {
  const models = useModels();
  const walker = useWalker('anchor-square', onArrive, interactive);
  // Ambient critters: motion only while the world is interactive and motion
  // is allowed; on low tier they render as static silhouettes.
  const critters = useCritters(interactive && !prefersReducedMotion(), detailLevel);
  const [walkTarget, setWalkTarget] = useState<AnchorId | null>(null);

  // Area-based activation: the area the avatar currently stands in plus the
  // areas one waypoint-hop away are "visible". NPCs outside this set are data
  // in memory only — no React subtree, no animation work — so the NPC count
  // can grow without growing per-frame work.
  const activeAreaId: AreaId = areaForAnchor(walker.at);
  const visibleAreas = visibleAreaIds(activeAreaId);
  // Coarse world clock: each arrival ticks once, so scheduled NPCs advance
  // through their spots as the world is travelled — event-driven, never a
  // per-frame clock, and never a function of where the player stands.
  const [worldClock, setWorldClock] = useState<{ at: AnchorId; tick: number }>({
    at: walker.at,
    tick: 0,
  });
  if (worldClock.at !== walker.at) {
    setWorldClock({ at: walker.at, tick: worldClock.tick + 1 });
  }
  const worldTime = worldClock.tick;
  const inVisibleArea = (x: number, z: number) => {
    const areaId = areaAt(x, z);
    return areaId !== null && visibleAreas.includes(areaId);
  };
  useImperativeHandle(
    handleRef,
    () => ({
      goTo: (anchor, onArrived) => {
        const walked = walker.walkTo(anchor, () => {
          setWalkTarget(null);
          // Arrival side effects (sound, first-use hint) always run; the
          // caller's callback (e.g. opening the quest dialogue) runs on top.
          onArrive(anchor);
          onArrived?.();
        });
        if (walked) setWalkTarget(anchor);
        return walked;
      },
      cancel: () => {
        setWalkTarget(null);
        walker.cancel();
      },
    }),
    [walker, onArrive],
  );

  const walkHere = (anchor: AnchorId) => {
    const walked = walker.walkTo(anchor, () => {
      setWalkTarget(null);
      // Tapping the world is a full interaction: clear the marker and fire
      // the shared arrival handler so NPC taps open their dialogue.
      onArrive(anchor);
    });
    if (walked) setWalkTarget(anchor);
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
          if (!interactive) return;
          event.stopPropagation();
          const anchor = nearestWalkableAnchor(event.point.x, event.point.z, 2.5);
          if (anchor) walkHere(anchor);
        }}
      />

      {ANCHORS.filter((anchor) => anchor.walkable).map((anchor) => (
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
        const anchor = getAnchor(quest.anchorId as AnchorId);
        if (!visibleAreas.includes(anchor.areaId)) return null;
        const status = questStatuses[quest.id];
        const active = interactive && status !== 'locked';
        const suggested = quest.id === suggestedQuestId && status !== 'locked';
        return (
          <group key={quest.id}>
            <Hotspot
              x={anchor.x}
              z={anchor.z}
              active={active}
              suggested={suggested}
              label={`hotspot-${quest.id}`}
              onSelect={() => walkHere(anchor.id)}
            />
            {active ? (
              <QuestMarker
                x={anchor.x}
                z={anchor.z}
                emoji={questEmoji(quest.id)}
                suggested={suggested}
              />
            ) : null}
          </group>
        );
      })}

      {walkTarget !== null ? (
        <DestinationMarker x={getAnchor(walkTarget).x} z={getAnchor(walkTarget).z} />
      ) : null}

      {/* NPCs are data-driven: one row in NPC_DEFINITIONS + one row in
          NPC_LOOKS is a whole character. Only NPCs currently standing in a
          visible area mount a figure — schedules resolve standpoints as a
          deterministic function of world time, so idle NPCs cost
          nothing and `frameloop="demand"` is untouched. */}
      {NPC_DEFINITIONS.map((npc) => {
        const anchor = getAnchor(resolveNpcAnchor(npc, worldTime));
        if (!visibleAreas.includes(anchor.areaId)) return null;
        const npcX = anchor.x + 0.9;
        const npcZ = anchor.z - 0.4;
        const dx = walker.position.x - npcX;
        const dz = walker.position.z - npcZ;
        // Neighbours turn to watch the player approach: attention is feedback.
        const facing = Math.hypot(dx, dz) < 6 ? Math.atan2(dx, dz) : 0;
        const look = npcLook(npc.id);
        return (
          <models.Figure
            key={npc.id}
            position={{ x: npcX, z: npcZ }}
            rotationY={facing}
            palette={look.palette}
            hairStyle={look.hairStyle}
            hairColor={look.hairColor}
            label={npc.id}
            detailLevel={detailLevel}
            role={look.role}
          />
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

      {/* Visual path decoration derived from EDGES — read-only, never alters
          anchors, pathfinding, or movement. dispose={null}: this block and
          the authored GROUND_DECORATIONS below consume only module-level
          shared resources, so canvas remounts must not dispose them. */}
      <group dispose={null}>
        <Detail level={detailLevel} min={1}>
          {EDGES.map((edge) => (
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
