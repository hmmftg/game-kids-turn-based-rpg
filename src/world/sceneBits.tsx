import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { AnchorId } from '../domain/game/types.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { recordEpisode, type SemanticAnimationEvent } from '../services/animationEvents.ts';
import { noRaycast } from './models/raycast.ts';
import { BOX, sharedLambert } from './models/shared.ts';

/**
 * Interactive scene pieces shared by every map scene (town Hub, cave, future
 * secondary maps): the tappable world target and the character reaction
 * primitive. They are presentation-only — the walk and CHOOSE commands live
 * elsewhere. There are no abstract "look here" markers: the physical figure,
 * object, or doorway is the affordance.
 */

/** Who reacted to the child — a one-shot cue target, `nonce` replays. */
export interface NpcAttention {
  readonly npcId: string;
  readonly nonce: number;
  /** Closed CharacterReact vocabulary for world reactions. */
  readonly context: 'notices-child' | 'greets-child';
  /**
   * Arrival identity the cue belongs to, when it is an arrival reaction.
   * Invariant: a given avatar arrival produces at most one `notices-child`
   * per NPC, regardless of rerenders, dwell, or demand renders.
   */
  readonly arrivalNonce?: number | undefined;
}

export interface WorldSceneHandle {
  /**
   * Walk to an anchor from a DOM action button (the accessible alternative to
   * tapping). Returns false when walking is not possible right now. `onArrive`,
   * when given, runs once the avatar reaches the anchor.
   */
  readonly goTo: (anchor: AnchorId, onArrive?: () => void) => boolean;
  readonly cancel: () => void;
  /** Live avatar ground position — the DOM accessibility routes (e.g. the
      Nearby sheet) resolve "who is near me" against it. */
  readonly playerPosition: () => { readonly x: number; readonly z: number };
}

export const TAP_ONLY_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

/**
 * Invisible-but-generous tap surface on an interactive anchor. The visible
 * affordance is the physical thing already standing there — a person,
 * building, rock, or doorway — never a ring or pulse.
 */
export function Hotspot({
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
  return (
    <mesh
      name={label}
      position={[x, 0.03, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={TAP_ONLY_MATERIAL}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 6 || !active) return;
        event.stopPropagation();
        onSelect();
      }}
    >
      <circleGeometry args={[0.9, 20]} />
    </mesh>
  );
}

type WorldReactContext = Extract<
  SemanticAnimationEvent['context'],
  'notices-child' | 'greets-child'
>;

/**
 * CharacterReact — the only semantic character operation in the world layer.
 *
 * `notices-child` is an arrival acknowledgement: a small turn/lean toward the
 * child, deliberately quieter than a greeting. `greets-child` is the social
 * greeting: the figure turns and one arm lifts in a short wave. Both are
 * one-shot episodes with explicit invalidation; nothing keeps animating once
 * the reaction settles, and reduced motion keeps the still final pose.
 */
export function CharacterReact({
  npcId,
  nonce,
  context,
  armColor,
  children,
}: {
  readonly npcId: string;
  readonly nonce: number;
  readonly context: WorldReactContext;
  /** Humanoid figures get a small limb-coloured arm for `greets-child`. */
  readonly armColor?: string | undefined;
  readonly children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();
  const duration = context === 'greets-child' ? 0.8 : 0.55;

  useEffect(() => {
    startedAt.current = null;
    if (nonce === 0) return;
    recordEpisode([
      {
        type: 'character-react',
        subjectId: npcId,
        context,
        duration: reduced ? 0 : Math.round(duration * 1000),
      },
    ]);
    if (!reduced) invalidate();
  }, [npcId, nonce, context, duration, reduced, invalidate]);

  useFrame((frameState) => {
    const group = groupRef.current;
    if (!group || nonce === 0 || reduced) return;
    if (startedAt.current === null) startedAt.current = frameState.clock.elapsedTime;
    const t = (frameState.clock.elapsedTime - startedAt.current) / duration;
    if (t >= 1) {
      group.rotation.set(0, 0, 0);
      group.position.y = 0;
      if (armRef.current) {
        armRef.current.visible = false;
        armRef.current.rotation.z = 0;
      }
      return;
    }

    const settle = Math.sin(t * Math.PI);
    if (context === 'notices-child') {
      // A look, not a greeting: the whole body tips toward the child.
      group.rotation.y = settle * 0.18;
      group.position.y = settle * 0.03;
    } else {
      group.rotation.y = settle * 0.12;
      const arm = armRef.current;
      if (arm) {
        arm.visible = armColor !== undefined;
        const lift = Math.sin(Math.min(1, t * 1.35) * (Math.PI / 2));
        const wave = Math.sin(t * Math.PI * 4) * 0.28 * (1 - t);
        arm.rotation.z = -2.15 * lift + wave;
      }
    }
    invalidate();
  });

  return (
    <group ref={groupRef} dispose={null}>
      {children}
      {armColor !== undefined ? (
        <group ref={armRef} position={[-0.36, 0.98, 0]} visible={false}>
          <mesh
            geometry={BOX}
            material={sharedLambert(armColor)}
            position={[0, -0.2, 0]}
            scale={[0.14, 0.42, 0.14]}
            raycast={noRaycast}
          />
        </group>
      ) : null}
    </group>
  );
}
