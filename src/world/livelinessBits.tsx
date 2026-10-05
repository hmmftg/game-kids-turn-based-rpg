import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { prefersReducedMotion } from '../services/device/capabilities.ts';
import { activityPoseTransform, type NpcActivityPose, type NpcIdleCue } from './liveliness.ts';

/**
 * Presentation liveliness — Delight Pass PR 1.
 *
 * Bounded visual flourishes that are NOT semantic animation: nothing here
 * records to `window.__worldAnimationEvents`. `CharacterReact` remains the
 * only instrumented character operation; this layer keeps that stream
 * answering "what semantic thing happened?".
 *
 * Every flourish is event-triggered (a nonce change = arrival, world-time
 * tick, or entering idle), runs one short motion, then stops and returns the
 * demand renderer to idle. Reduced motion skips the motion and keeps the
 * held activity pose — the settled state stays perceivable.
 *
 * Transform ownership: each wrapper here animates only its OWN group node
 * (plus detail meshes it discovers inside itself, like `face-eye`); the
 * walker drives `models.Figure` via props. New motion = a new nested group,
 * never a second writer on an existing node (docs/LIVING-WORLD.md).
 */

const LOOKS_AROUND_SECONDS = 0.8;
const BLINK_SECONDS = 0.22;
const SETTLE_SECONDS = 0.45;
const GLANCE_SECONDS = 0.9;

/** Shortest signed angular distance from `a` to `b`. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Eye meshes named `face-eye` inside the wrapped figure subtree — blink
    needs them; figures without them (animals) fall back to a head nod. */
function findEyes(root: THREE.Object3D): THREE.Mesh[] {
  const eyes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj.name === 'face-eye') eyes.push(obj as THREE.Mesh);
  });
  return eyes;
}

/**
 * NPC idle cue + held activity pose. The inner pose group carries the static
 * `NpcActivityPose` transform; a cue (`nonce` change) adds one bounded
 * flourish on top and settles back to that same held pose.
 */
export function IdleFlourish({
  nonce,
  cue,
  pose,
  children,
}: {
  readonly nonce: number;
  readonly cue: NpcIdleCue | null;
  readonly pose: NpcActivityPose;
  readonly children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const eyesRef = useRef<THREE.Mesh[] | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();
  const duration = cue === 'blink' ? BLINK_SECONDS : LOOKS_AROUND_SECONDS;
  const base = activityPoseTransform(pose);

  useEffect(() => {
    startedAt.current = null;
    if (nonce === 0 || cue === null || reduced) return;
    invalidate();
  }, [nonce, cue, reduced, invalidate]);

  useFrame((frameState) => {
    const group = groupRef.current;
    if (!group) return;
    if (eyesRef.current === null) eyesRef.current = findEyes(group);
    const eyes = eyesRef.current;

    if (nonce === 0 || cue === null || reduced) {
      group.rotation.set(base.rotationX, 0, base.rotationZ);
      group.position.y = base.offsetY;
      for (const eye of eyes) eye.scale.y = 0.07;
      return;
    }
    if (startedAt.current === null) startedAt.current = frameState.clock.elapsedTime;
    const t = (frameState.clock.elapsedTime - startedAt.current) / duration;
    if (t >= 1) {
      startedAt.current = null;
      group.rotation.set(base.rotationX, 0, base.rotationZ);
      group.position.y = base.offsetY;
      for (const eye of eyes) eye.scale.y = 0.07;
      return;
    }

    const settle = Math.sin(t * Math.PI);
    group.position.y = base.offsetY;
    if (cue === 'looks-around') {
      // One sweep out and back — reads as looking around, then settling.
      group.rotation.set(base.rotationX, settle * 0.3, base.rotationZ);
    } else if (eyes.length > 0) {
      // True blink: the eyes squash shut and reopen.
      for (const eye of eyes) eye.scale.y = 0.07 * (1 - settle * 0.9);
      group.rotation.set(base.rotationX, 0, base.rotationZ);
    } else {
      // No eye meshes (critters) — a small head dip reads as the same beat.
      group.rotation.set(base.rotationX + settle * 0.16, 0, base.rotationZ);
    }
    invalidate();
  });

  return (
    <group ref={groupRef} dispose={null}>
      {children}
    </group>
  );
}

/**
 * Avatar arrival flourish: one bounded chain per arrival —
 *   settle (squash-and-recover) → glance toward a resolved target → blink.
 *
 * The glance target is resolved ONCE by the caller at the moment the avatar
 * settles (`glanceHeading`); there is no per-frame nearest-NPC search and the
 * offset eases out and back so the figure self-restores. `nonce === 0` or
 * reduced motion leaves a still figure.
 */
export function AvatarLiveliness({
  arrivalNonce,
  glanceHeading,
  children,
}: {
  readonly arrivalNonce: number;
  /** Heading (world yaw) resolved once at settle; null = no glance this arrival. */
  readonly glanceHeading: number | null;
  readonly children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const eyesRef = useRef<THREE.Mesh[] | null>(null);
  const heading = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    startedAt.current = null;
    if (arrivalNonce === 0 || reduced) return;
    // Capture the rotation the wrapper currently holds so the glance eases
    // from there toward the resolved heading, not from a snapped zero.
    heading.current = groupRef.current?.rotation.y ?? 0;
    invalidate();
  }, [arrivalNonce, reduced, invalidate]);

  useFrame((frameState) => {
    const group = groupRef.current;
    if (!group) return;
    if (eyesRef.current === null) eyesRef.current = findEyes(group);
    const eyes = eyesRef.current;

    if (arrivalNonce === 0 || reduced) {
      group.rotation.y = 0;
      group.scale.y = 1;
      for (const eye of eyes) eye.scale.y = 0.07;
      return;
    }
    if (startedAt.current === null) startedAt.current = frameState.clock.elapsedTime;
    const t =
      (frameState.clock.elapsedTime - startedAt.current) /
      (SETTLE_SECONDS + GLANCE_SECONDS + BLINK_SECONDS);
    if (t >= 1) {
      startedAt.current = null;
      group.rotation.y = 0;
      group.scale.y = 1;
      for (const eye of eyes) eye.scale.y = 0.07;
      return;
    }

    const elapsed = t * (SETTLE_SECONDS + GLANCE_SECONDS + BLINK_SECONDS);
    if (elapsed < SETTLE_SECONDS) {
      // Arrival settle: a soft squash that recovers — landing, not bouncing.
      const s = Math.sin((elapsed / SETTLE_SECONDS) * Math.PI);
      group.scale.y = 1 - s * 0.12;
      group.rotation.y = 0;
    } else if (elapsed < SETTLE_SECONDS + GLANCE_SECONDS && glanceHeading !== null) {
      // Glance out and back toward the resolved heading — the look self-restores.
      const s = Math.sin(((elapsed - SETTLE_SECONDS) / GLANCE_SECONDS) * Math.PI);
      group.scale.y = 1;
      group.rotation.y = angleDelta(heading.current, glanceHeading) * s * 0.7;
    } else if (elapsed < SETTLE_SECONDS + GLANCE_SECONDS) {
      group.scale.y = 1;
      group.rotation.y = 0;
    } else {
      // Blink close: eyes dip once as the flourish ends.
      const s = Math.sin(((elapsed - SETTLE_SECONDS - GLANCE_SECONDS) / BLINK_SECONDS) * Math.PI);
      group.scale.y = 1;
      group.rotation.y = 0;
      for (const eye of eyes) eye.scale.y = 0.07 * (1 - s * 0.9);
    }
    invalidate();
  });

  return (
    <group ref={groupRef} dispose={null}>
      {children}
    </group>
  );
}
