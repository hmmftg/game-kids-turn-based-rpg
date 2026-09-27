import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AnchorId, AvatarId, QuestId, QuestStatus } from '../domain/game/types.ts';
import { QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { ANCHORS, getAnchor } from './navigation/graph.ts';
import { nearestWalkableAnchor } from './navigation/pathfinding.ts';
import { noRaycast } from './models/raycast.ts';
import { useWalker } from './useWalker.ts';
import { questEmoji } from '../ui/child/emoji.ts';
import {
  AVATAR_PALETTES,
  LANDMARK_PALETTE,
  NPC_PALETTE,
  PROP_PALETTE,
  useModels,
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
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly completedCount: number;
  readonly interactive: boolean;
  /** The quest the objective chip currently points at, if any. */
  readonly suggestedQuestId: QuestId | null;
  readonly onArrive: (anchor: AnchorId) => void;
  readonly handleRef: Ref<HubHandle> | undefined;
}

const GROUND = new THREE.PlaneGeometry(40, 40);
const GROUND_MATERIAL = new THREE.MeshLambertMaterial({ color: '#efe0bd' });
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

export function Hub({
  avatarId,
  questStatuses,
  completedCount,
  interactive,
  suggestedQuestId,
  onArrive,
  handleRef,
}: HubProps) {
  const models = useModels();
  const walker = useWalker('anchor-square', onArrive, interactive);
  const [walkTarget, setWalkTarget] = useState<AnchorId | null>(null);
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

  // The keepsake tree eases toward the true completed count so a completion
  // reads as the world visibly growing, not as a silent prop change. Under
  // reduced motion it snaps straight to the final height.
  const growth = useRef(completedCount);
  const treeRef = useRef<THREE.Group>(null);
  const reducedMotion = prefersReducedMotion();
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, delta) => {
    const current = growth.current;
    if (current === completedCount || !treeRef.current) return;
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
    const trunkMesh = treeRef.current.children[0];
    const canopyMesh = treeRef.current.children[1];
    if (!trunkMesh || !canopyMesh) return;
    trunkMesh.scale.set(1, trunk, 1);
    trunkMesh.position.y = trunk / 2;
    canopyMesh.scale.set(canopy * bounce, 0.5 * bounce, canopy * bounce);
    canopyMesh.position.y = trunk + 0.22;
  });
  const initialTrunk = 0.3 + completedCount * 0.35;
  const initialCanopy = 0.7 + completedCount * 0.18;

  return (
    <group>
      <hemisphereLight args={['#ffffff', '#c8b78f', 1.1]} />
      <directionalLight position={[6, 10, 4]} intensity={0.75} />

      {/* Ground doubles as the walk surface: taps resolve to the nearest anchor. */}
      <mesh
        geometry={GROUND}
        material={GROUND_MATERIAL}
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

      {QUEST_DEFINITIONS.map((quest) => {
        const anchor = getAnchor(quest.anchorId as AnchorId);
        const status = questStatuses[quest.id];
        const active = interactive && status !== 'locked';
        const suggested = quest.id === suggestedQuestId && status !== 'locked';
        return (
          <group key={quest.id}>
            <models.Landmark
              position={{ x: anchor.x, z: anchor.z - 1.2 }}
              palette={LANDMARK_PALETTE}
            />
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

      {ANCHORS.filter((anchor) => anchor.npcId !== null).map((anchor) => {
        const npcX = anchor.x + 0.9;
        const npcZ = anchor.z - 0.4;
        const dx = walker.position.x - npcX;
        const dz = walker.position.z - npcZ;
        // Neighbours turn to watch the player approach: attention is feedback.
        const facing = Math.hypot(dx, dz) < 6 ? Math.atan2(dx, dz) : 0;
        return (
          <models.Figure
            key={anchor.npcId}
            position={{ x: npcX, z: npcZ }}
            rotationY={facing}
            palette={NPC_PALETTE}
            label={anchor.npcId ?? ''}
          />
        );
      })}

      <models.Prop position={{ x: 1.4, z: 1.2 }} palette={PROP_PALETTE} shape="cylinder" />
      <models.Prop position={{ x: -1.5, z: -1.1 }} palette={PROP_PALETTE} />
      <models.Prop position={{ x: 4.6, z: 1.4 }} palette={PROP_PALETTE} />

      {/* Progress keepsake: the neighbourhood tree grows with each completed chapter. */}
      <group position={[-1.2, 0, 1.6]} name="keepsake" ref={treeRef}>
        <mesh position={[0, initialTrunk / 2, 0]} scale={[1, initialTrunk, 1]} raycast={noRaycast}>
          <cylinderGeometry args={[0.12, 0.16, 1, 8]} />
          <meshLambertMaterial color="#8a5a33" />
        </mesh>
        <mesh
          position={[0, initialTrunk + 0.22, 0]}
          scale={[initialCanopy, 0.5, initialCanopy]}
          raycast={noRaycast}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial color="#4f8f4f" />
        </mesh>
      </group>

      <models.Figure
        position={walker.position}
        rotationY={walker.heading}
        bobbing={walker.bobbing}
        palette={AVATAR_PALETTES[avatarId]}
        label="avatar"
      />
    </group>
  );
}
