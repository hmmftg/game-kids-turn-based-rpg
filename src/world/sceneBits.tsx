import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AnchorId } from '../domain/game/types.ts';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { noRaycast } from './models/raycast.ts';

/**
 * Interactive scene pieces shared by every map scene (town Hub, cave, future
 * secondary maps): the tappable hotspot ring, the walk-destination marker and
 * the floating quest emoji. They are presentation-only — the walk and the
 * CHOOSE commands live elsewhere.
 */

/** Who noticed the child's arrival — a one-shot cue target, `nonce` replays. */
export interface NpcAttention {
  readonly npcId: string;
  readonly nonce: number;
}

export interface WorldSceneHandle {
  /**
   * Walk to an anchor from a DOM action button (the accessible alternative to
   * tapping). Returns false when walking is not possible right now. `onArrive`,
   * when given, runs once the avatar reaches the anchor.
   */
  readonly goTo: (anchor: AnchorId, onArrive?: () => void) => boolean;
  readonly cancel: () => void;
}

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
export function Hotspot({
  x,
  z,
  active,
  suggested = false,
  onSelect,
  label,
}: {
  readonly x: number;
  readonly z: number;
  readonly active: boolean;
  /** Strongest affordance: this hotspot is where the current objective lives. */
  readonly suggested?: boolean;
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
        if (event.delta > 6) return;
        event.stopPropagation();
        if (active) onSelect();
      }}
    >
      <ringGeometry args={[0.5, suggested ? 0.9 : 0.78, 20]} />
    </mesh>
  );
}

/**
 * One-shot "I see you" cue: the figure gives a single gentle bounce when the
 * child reaches its spot. Under demand-rendering each animated frame
 * invalidates explicitly; when the bounce settles the loop goes quiet again.
 * Reduced motion keeps the still figure — the turn-to-face rule already
 * carries the meaning.
 */
export function AttentionPulse({
  nonce,
  children,
}: {
  readonly nonce: number;
  readonly children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    startedAt.current = null;
    if (nonce > 0 && !reduced) invalidate();
  }, [nonce, reduced, invalidate]);

  useFrame((frameState) => {
    if (reduced || !ref.current || nonce === 0) return;
    if (startedAt.current === null) startedAt.current = frameState.clock.elapsedTime;
    const t = (frameState.clock.elapsedTime - startedAt.current) / 0.55;
    if (t >= 1) {
      ref.current.scale.setScalar(1);
      return;
    }
    ref.current.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.18);
    invalidate();
  });

  return <group ref={ref}>{children}</group>;
}

/** Destination marker shown at the walk target until the avatar arrives. */
export function DestinationMarker({ x, z }: { readonly x: number; readonly z: number }) {
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
export function QuestMarker({
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
