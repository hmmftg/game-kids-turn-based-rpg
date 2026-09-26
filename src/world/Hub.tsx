import { useImperativeHandle, useRef, type Ref } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { AnchorId, AvatarId, QuestId, QuestStatus } from '../domain/game/types.ts';
import { QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { ANCHORS, getAnchor } from './navigation/graph.ts';
import { nearestWalkableAnchor } from './navigation/pathfinding.ts';
import { noRaycast } from './models/raycast.ts';
import { useWalker } from './useWalker.ts';
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

/** Pulsing ring that marks an interactive anchor; also the only clickable geometry. */
function Hotspot({
  x,
  z,
  active,
  onSelect,
  label,
}: {
  readonly x: number;
  readonly z: number;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly label: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const reduced = prefersReducedMotion();

  useFrame((frameState) => {
    if (!ref.current || !active || reduced) return;
    const pulse = 1 + Math.sin(frameState.clock.elapsedTime * 2.4) * 0.12;
    ref.current.scale.set(pulse, pulse, pulse);
  });

  return (
    <mesh
      ref={ref}
      name={label}
      position={[x, 0.03, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={HOTSPOT_MATERIAL}
      visible={active}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (active) onSelect();
      }}
    >
      <ringGeometry args={[0.5, 0.78, 20]} />
    </mesh>
  );
}

export function Hub({
  avatarId,
  questStatuses,
  completedCount,
  interactive,
  onArrive,
  handleRef,
}: HubProps) {
  const models = useModels();
  const walker = useWalker('anchor-square', onArrive, interactive);
  useImperativeHandle(
    handleRef,
    () => ({ goTo: (anchor, onArrive) => walker.walkTo(anchor, onArrive), cancel: walker.cancel }),
    [walker],
  );

  const keepsakeHeight = 0.3 + completedCount * 0.35;

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
          if (anchor) walker.walkTo(anchor);
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
        return (
          <group key={quest.id}>
            <models.Landmark
              position={{ x: anchor.x, z: anchor.z - 1.2 }}
              palette={LANDMARK_PALETTE}
            />
            <Hotspot
              x={anchor.x}
              z={anchor.z}
              active={interactive && status !== 'locked'}
              label={`hotspot-${quest.id}`}
              onSelect={() => walker.walkTo(anchor.id)}
            />
          </group>
        );
      })}

      {ANCHORS.filter((anchor) => anchor.npcId !== null).map((anchor) => (
        <models.Figure
          key={anchor.npcId}
          position={{ x: anchor.x + 0.9, z: anchor.z - 0.4 }}
          palette={NPC_PALETTE}
          label={anchor.npcId ?? ''}
        />
      ))}

      <models.Prop position={{ x: 1.4, z: 1.2 }} palette={PROP_PALETTE} shape="cylinder" />
      <models.Prop position={{ x: -1.5, z: -1.1 }} palette={PROP_PALETTE} />
      <models.Prop position={{ x: 4.6, z: 1.4 }} palette={PROP_PALETTE} />

      {/* Progress keepsake: the neighbourhood tree grows with each completed chapter. */}
      <group position={[-1.2, 0, 1.6]} name="keepsake">
        <mesh position={[0, keepsakeHeight / 2, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.12, 0.16, keepsakeHeight, 8]} />
          <meshLambertMaterial color="#8a5a33" />
        </mesh>
        <mesh position={[0, keepsakeHeight + 0.22, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.7 + completedCount * 0.18, 0.5, 0.7 + completedCount * 0.18]} />
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
