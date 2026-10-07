import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
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

/** The named neck-pivot group `CubicFigure` wraps the head in — the glance
    turns this node, never the body. */
function findHead(root: THREE.Object3D): THREE.Object3D | null {
  return root.getObjectByName('figure-head') ?? null;
}

/** Max head turn during a glance — past this the body should walk, not the
    neck crane. */
const MAX_HEAD_TURN = 0.85;

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
  const headRef = useRef<THREE.Object3D | null>(null);
  const figureRef = useRef<THREE.Object3D | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    startedAt.current = null;
    if (arrivalNonce === 0 || reduced) return;
    invalidate();
  }, [arrivalNonce, reduced, invalidate]);

  useFrame((frameState) => {
    const group = groupRef.current;
    if (!group) return;
    if (eyesRef.current === null) {
      eyesRef.current = findEyes(group);
      headRef.current = findHead(group);
      // The figure root carries the walker's yaw — the glance delta is
      // measured against it, never against this wrapper (which stays put).
      figureRef.current = group.getObjectByName('avatar') ?? null;
    }
    const eyes = eyesRef.current;
    const head = headRef.current;

    if (arrivalNonce === 0 || reduced) {
      group.scale.y = 1;
      if (head) head.rotation.y = 0;
      for (const eye of eyes) eye.scale.y = 0.07;
      return;
    }
    if (startedAt.current === null) startedAt.current = frameState.clock.elapsedTime;
    const t =
      (frameState.clock.elapsedTime - startedAt.current) /
      (SETTLE_SECONDS + GLANCE_SECONDS + BLINK_SECONDS);
    if (t >= 1) {
      startedAt.current = null;
      group.scale.y = 1;
      if (head) head.rotation.y = 0;
      for (const eye of eyes) eye.scale.y = 0.07;
      return;
    }

    const elapsed = t * (SETTLE_SECONDS + GLANCE_SECONDS + BLINK_SECONDS);
    if (elapsed < SETTLE_SECONDS) {
      // Arrival settle: a soft squash that recovers — landing, not bouncing.
      const s = Math.sin((elapsed / SETTLE_SECONDS) * Math.PI);
      group.scale.y = 1 - s * 0.12;
      if (head) head.rotation.y = 0;
    } else if (elapsed < SETTLE_SECONDS + GLANCE_SECONDS && glanceHeading !== null && head) {
      // Glance out and back — the HEAD turns toward the resolved heading
      // (clamped to a believable neck angle), the body keeps its walk yaw.
      const s = Math.sin(((elapsed - SETTLE_SECONDS) / GLANCE_SECONDS) * Math.PI);
      group.scale.y = 1;
      const figureYaw = figureRef.current?.rotation.y ?? 0;
      const delta = THREE.MathUtils.clamp(
        angleDelta(figureYaw, glanceHeading),
        -MAX_HEAD_TURN,
        MAX_HEAD_TURN,
      );
      head.rotation.y = delta * s;
    } else if (elapsed < SETTLE_SECONDS + GLANCE_SECONDS) {
      group.scale.y = 1;
      if (head) head.rotation.y = 0;
    } else {
      // Blink close: eyes dip once as the flourish ends.
      const s = Math.sin(((elapsed - SETTLE_SECONDS - GLANCE_SECONDS) / BLINK_SECONDS) * Math.PI);
      group.scale.y = 1;
      if (head) head.rotation.y = 0;
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

const TRANSIT_SPEED = 3.2; // world units per second — a stroll, not a dash.

/**
 * Routine relocations are walked, never teleported. When a tick moves an
 * NPC's resolved stand to a new spot, the body physically strolls the
 * difference and faces its direction of travel — the child reads "she is
 * going over there", not "she vanished". The tap cylinder travels inside
 * the same group so the figure stays tappable mid-walk, and `onNpcTap`
 * still resolves the authoritative destination stand.
 *
 * Implementation: the wrapper keeps `offset = rendered − target`. A target
 * change (detected in `useLayoutEffect`, before the next demand frame can
 * draw) adds the old rendered spot into the offset; each drawn frame walks
 * the offset back to zero at TRANSIT_SPEED and invalidates only while
 * moving. Reduced motion skips the walk and snaps — honest, still legible.
 */
export function NpcTransit({
  x,
  z,
  facing,
  name,
  children,
}: {
  readonly x: number;
  readonly z: number;
  /** The inner figure's settled facing — subtracted while travelling so the
      body heads where it walks, not where it was posed. */
  readonly facing: number;
  /** Probe/debug name on the wrapper group. */
  readonly name?: string;
  readonly children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const target = useRef({ x, z });
  const offset = useRef({ x: 0, z: 0 });
  const invalidate = useThree((state) => state.invalidate);
  const reduced = prefersReducedMotion();

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // Target moved: the figure stays where it rendered and walks back.
    if (target.current.x !== x || target.current.z !== z) {
      offset.current = {
        x: target.current.x + offset.current.x - x,
        z: target.current.z + offset.current.z - z,
      };
      target.current = { x, z };
      if (reduced) {
        offset.current = { x: 0, z: 0 };
      } else {
        invalidate();
      }
    }
    group.position.set(x + offset.current.x, 0, z + offset.current.z);
  });

  useFrame((_, dt) => {
    const group = groupRef.current;
    if (!group) return;
    const { x: ox, z: oz } = offset.current;
    const dist = Math.hypot(ox, oz);
    if (dist < 0.02) {
      if (ox !== 0 || oz !== 0 || group.rotation.y !== 0) {
        offset.current = { x: 0, z: 0 };
        group.position.set(x, 0, z);
        group.rotation.y = 0;
        invalidate();
      }
      return;
    }
    const step = Math.min(dist, TRANSIT_SPEED * dt);
    offset.current = { x: ox - (ox / dist) * step, z: oz - (oz / dist) * step };
    group.position.set(x + offset.current.x, 0, z + offset.current.z);
    group.rotation.y = Math.atan2(ox, oz) - facing;
    invalidate();
  });

  return (
    <group ref={groupRef} name={name ?? ''} position={[x, 0, z]} dispose={null}>
      {children}
    </group>
  );
}
