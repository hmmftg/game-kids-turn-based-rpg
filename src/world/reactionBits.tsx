import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { PlantCluster, type Xyz } from './models/details.tsx';
import { noRaycast } from './models/raycast.ts';
import { BOX, SPHERE, sharedLambert } from './models/shared.ts';
import {
  reactionAborted,
  reactionCompleted,
  reactionStarted,
  recordReactionProbe,
  reactionTransform,
  REACTION_SECONDS,
  type FlourishReaction,
} from './reactions.ts';

/**
 * Reactive world objects — Delight Pass PR 2.
 *
 * A `ReactiveProp` is a physical thing the child can tap for one bounded
 * physical response: an invisible generous tap surface (the visible
 * affordance is the object itself — never a ring or pulse) plus ONE nested
 * flourish group whose transform the reaction owns outright. The tap does
 * NOT stop propagation: the reaction layers on the world's ordinary tap
 * semantics, so the touch still walks/selects like a ground tap — a prop
 * tap is never a dead touch or a stolen walk waypoint.
 *
 * Same contract as `livelinessBits`: presentation only, never recorded to
 * `__worldAnimationEvents`, event-triggered (one flourish per tap), and the
 * demand renderer returns to idle when it ends. Reduced motion drops the
 * motion; the object keeps its rest state, which is also its meaning.
 */

// Raycastable but unseen: a fully transparent fill, so the hit test still
// intersects it while nothing draws.
const TAP_MATERIAL = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

/**
 * The flourish's own group — the ONLY node the reaction transforms. Position
 * the component where the reaction pivots (a door's hinge edge, a flower's
 * base); children are placed relative to that pivot.
 */
export function ReactiveProp({
  reaction,
  subject,
  enabled = true,
  position = [0, 0, 0],
  radius = 0.45,
  tapShape = 'disc',
  tapSize,
  tapOffset = [0, 0, 0],
  onReact,
  children,
}: {
  readonly reaction: FlourishReaction;
  /** Probe subject id, e.g. 'flower@2,-2.6' or 'fountain'. */
  readonly subject: string;
  /** Taps are ignored while the world is non-interactive (dialogue, pause). */
  readonly enabled?: boolean;
  /** Where the reaction pivots (a flower's base, a door's hinge edge). */
  readonly position?: Xyz;
  /** Disc tap radius, or half-extent when `tapShape` is 'panel'. */
  readonly radius?: number;
  /** 'disc' lies flat on the ground; 'panel' stands vertical facing +z (doors). */
  readonly tapShape?: 'disc' | 'panel';
  /** Panel width × height; ignored for 'disc'. */
  readonly tapSize?: readonly [number, number];
  /** Tap mesh offset inside this group (e.g. panel centre above the hinge). */
  readonly tapOffset?: Xyz;
  /** Side effect of the tap beyond the flourish itself (e.g. dart the fish)
      — receives the world-space tap point. */
  readonly onReact?: ((point: { readonly x: number; readonly z: number }) => void) | undefined;
  readonly children: ReactNode | ((nonce: number) => ReactNode);
}) {
  const [nonce, setNonce] = useState(0);
  const onTap = (event: ThreeEvent<MouseEvent>) => {
    if (!enabled || event.delta > 6) return;
    // No stopPropagation: the touch also reaches the ground/hotspot handler
    // below, so a prop reacts AND the world keeps its ordinary tap semantics
    // — a tap on a prop is never a dead touch or a stolen walk waypoint.
    setNonce((n) => n + 1);
    recordReactionProbe(subject, reaction);
    onReact?.({ x: event.point.x, z: event.point.z });
  };
  return (
    <group position={position} dispose={null}>
      <mesh
        name={`reactive-${subject}`}
        // Discs float just above the ground plane AND the 0.03 hotspot
        // tap-zone height: along the tap ray the prop's surface is hit
        // first, so a deliberate touch answers the object instead of being
        // swallowed by the walk ground or a quest hotspot beneath it.
        position={
          tapShape === 'disc' ? [tapOffset[0], tapOffset[1] + 0.05, tapOffset[2]] : tapOffset
        }
        rotation={tapShape === 'disc' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
        material={TAP_MATERIAL}
        onClick={onTap}
      >
        {tapShape === 'disc' ? (
          <circleGeometry args={[radius, 16]} />
        ) : (
          <planeGeometry args={tapSize ?? [radius * 2, radius * 2]} />
        )}
      </mesh>
      <PropFlourish reaction={reaction} nonce={nonce}>
        {typeof children === 'function' ? children(nonce) : children}
      </PropFlourish>
    </group>
  );
}

function PropFlourish({
  reaction,
  nonce,
  children,
}: {
  readonly reaction: FlourishReaction;
  readonly nonce: number;
  readonly children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const wasActive = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    // A retap while still flourishing aborts the old flourish's clock.
    if (wasActive.current) {
      wasActive.current = false;
      reactionAborted();
    }
    startedAt.current = null;
    if (nonce > 0) invalidate();
  }, [nonce, invalidate]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    if (nonce === 0 || reduced) {
      if (wasActive.current) {
        wasActive.current = false;
        reactionAborted();
      }
      if (group.rotation.x !== 0 || group.scale.y !== 1) {
        group.rotation.set(0, 0, 0);
        group.scale.set(1, 1, 1);
      }
      return;
    }
    if (startedAt.current === null) {
      startedAt.current = clock.elapsedTime;
      wasActive.current = true;
      reactionStarted();
    }
    const t = (clock.elapsedTime - startedAt.current) / REACTION_SECONDS[reaction];
    if (t >= 1) {
      if (wasActive.current) {
        wasActive.current = false;
        reactionCompleted();
      }
      group.rotation.set(0, 0, 0);
      group.scale.set(1, 1, 1);
      return;
    }
    const pose = reactionTransform(reaction, t);
    group.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ);
    group.scale.set(pose.scaleX, pose.scaleY, pose.scaleX);
    invalidate();
  });

  return (
    <group ref={groupRef} dispose={null}>
      {children}
    </group>
  );
}

const RIPPLE_SECONDS = 0.7;
const RIPPLE_MAX_RADIUS = 0.75;

/**
 * Water ring that spreads and fades on the fountain — the splash half of the
 * fountain reaction (the fish dart is the other). Mutates only its own mesh's
 * scale and opacity, then goes fully idle. Pass the flourish `nonce` from
 * `ReactiveProp`'s function children.
 */
export function ReactionRipple({
  nonce,
  y = 0.36,
}: {
  readonly nonce: number;
  readonly y?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startedAt = useRef<number | null>(null);
  const wasActive = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (wasActive.current) {
      wasActive.current = false;
      reactionAborted();
    }
    startedAt.current = null;
    if (nonce > 0) invalidate();
  }, [nonce, invalidate]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const material = mesh.material as THREE.MeshBasicMaterial;
    if (nonce === 0 || reduced) {
      if (wasActive.current) {
        wasActive.current = false;
        reactionAborted();
      }
      material.opacity = 0;
      return;
    }
    if (startedAt.current === null) {
      startedAt.current = clock.elapsedTime;
      wasActive.current = true;
      reactionStarted();
    }
    const t = (clock.elapsedTime - startedAt.current) / RIPPLE_SECONDS;
    if (t >= 1) {
      if (wasActive.current) {
        wasActive.current = false;
        reactionCompleted();
      }
      material.opacity = 0;
      return;
    }
    const s = 0.2 + t * RIPPLE_MAX_RADIUS;
    mesh.scale.set(s, s, 1);
    material.opacity = 0.55 * (1 - t);
    invalidate();
  });

  return (
    <mesh ref={meshRef} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.85, 1, 24]} />
      <meshBasicMaterial color="#eaf7ff" transparent opacity={0} />
    </mesh>
  );
}

const REVEAL_SECONDS = 0.7;
/** How far each leaf half slides when the find is uncovered. */
const LEAF_PART = 0.26;

/**
 * A tiny ladybug hiding under two leaf clumps — the only "secret" the
 * neighborhood keeps. Always mounted under the leaves so a reveal is a
 * physical uncover, never a spawn.
 */
function HiddenLadybug() {
  return (
    <group raycast={noRaycast}>
      <mesh
        geometry={SPHERE}
        material={sharedLambert('#d64a3a')}
        position={[0, 0.055, 0]}
        scale={[0.11, 0.07, 0.11]}
      />
      <mesh
        geometry={SPHERE}
        material={sharedLambert('#3a3230')}
        position={[0, 0.05, 0.055]}
        scale={[0.05, 0.045, 0.05]}
      />
      <mesh
        geometry={BOX}
        material={sharedLambert('#3a3230')}
        position={[0, 0.075, -0.01]}
        scale={[0.012, 0.012, 0.07]}
      />
    </group>
  );
}

/**
 * The two leaf halves plus the revealed creature. `open` drives one bounded
 * parting animation (0→1, ~0.7s) that STOPS at the open pose — the settled
 * revealed state, not a flourish that returns. Reduced motion renders the
 * find already parted: same meaning, no motion.
 */
function FindCover({ open }: { readonly open: boolean }) {
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const revealT = useRef(0);
  const wasActive = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();

  const apply = (t: number) => {
    const ease = t * t * (3 - 2 * t);
    const part = 0.1 + ease * LEAF_PART;
    leftRef.current?.position.set(-part, 0, -0.02 * ease);
    rightRef.current?.position.set(part, 0, 0.02 * ease);
  };

  useEffect(() => {
    if (open && !reduced) {
      wasActive.current = true;
      reactionStarted();
      invalidate();
    } else if (open) {
      revealT.current = 1;
      invalidate();
    }
    // Revealed state is session state — nothing ever re-covers.
  }, [open, reduced, invalidate]);

  useFrame((_, delta) => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    if (revealT.current >= 1) {
      if (wasActive.current) {
        wasActive.current = false;
        reactionCompleted();
      }
      apply(1);
      return;
    }
    if (!wasActive.current) return;
    revealT.current = Math.min(1, revealT.current + delta / REVEAL_SECONDS);
    apply(revealT.current);
    invalidate();
  });

  return (
    <group dispose={null}>
      <HiddenLadybug />
      <group ref={leftRef} position={[-0.1, 0, 0]}>
        <PlantCluster position={[0, 0, 0]} scale={0.9} />
      </group>
      <group ref={rightRef} position={[0.1, 0, 0]}>
        <PlantCluster position={[0, 0, 0]} scale={0.75} />
      </group>
    </group>
  );
}

/**
 * Hidden find — Delight Pass PR 3. A physical thing half-hidden in the
 * world; a deliberate touch parts the cover once and the find stays
 * revealed for the rest of the session. Same tap contract as ReactiveProp:
 * NO stopPropagation — the child also walks toward what it found. The
 * reveal is its own reward: no text, no marker, no counter.
 */
export function HiddenFind({
  subject,
  position,
  revealed,
  onReveal,
  enabled = true,
  radius = 0.7,
}: {
  /** Probe subject id, e.g. 'find-garden'. */
  readonly subject: string;
  readonly position: Xyz;
  readonly revealed: boolean;
  readonly onReveal: () => void;
  readonly enabled?: boolean;
  /** Disc tap radius — generous for small fingers. */
  readonly radius?: number;
}) {
  const onTap = (event: ThreeEvent<MouseEvent>) => {
    if (!enabled || event.delta > 6) return;
    if (revealed) return; // settled state — a retap is just a walk
    // No stopPropagation: same layered semantics as ReactiveProp.
    recordReactionProbe(subject, 'reveal');
    onReveal();
  };
  return (
    <group position={position} dispose={null}>
      <mesh
        name={`find-${subject}`}
        position={[0, 0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={TAP_MATERIAL}
        onClick={onTap}
      >
        <circleGeometry args={[radius, 16]} />
      </mesh>
      <FindCover open={revealed} />
    </group>
  );
}
