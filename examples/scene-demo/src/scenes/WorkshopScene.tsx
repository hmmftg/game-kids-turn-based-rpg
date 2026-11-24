import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { getAnchor } from 'waypoint-rpg-core';
import type { Group } from 'three';
import { getFact } from 'waypoint-rpg-narrative';
import type { SceneComponentProps } from '../scene-host.js';
import { workshopGraph } from '../scene-data.js';
import { sceneProbe } from '../probe.js';
import { useDemoState } from './scene-runtime.js';

export function WorkshopScene({ entryAnchorId, runtime, presentation }: SceneComponentProps) {
  const state = useDemoState(runtime);
  const lampLit = getFact(state.narrative, 'lantern-lit') === true;
  const entry = getAnchor(workshopGraph, entryAnchorId);

  return (
    <group name="workshop-scene">
      <color attach="background" args={['#d6e1ed']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[-4, 7, 5]} intensity={1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#8795a7" />
      </mesh>
      <mesh position={[entry.x, 0.28, entry.z]}>
        <capsuleGeometry args={[0.25, 0.5, 4, 8]} />
        <meshStandardMaterial color="#f2c75c" />
      </mesh>
      <mesh position={[1, 1.2, 1]}>
        <cylinderGeometry args={[0.12, 0.18, 1.5, 12]} />
        <meshStandardMaterial
          color={lampLit ? '#ffe48b' : '#6b7077'}
          emissive={lampLit ? '#ffc83d' : '#000000'}
          emissiveIntensity={lampLit ? 1.5 : 0}
        />
      </mesh>
      <pointLight
        position={[1, 2, 1]}
        color="#ffd96b"
        intensity={lampLit ? (presentation?.lanternAccent ? 4 : 2) : 0}
        distance={6}
      />
      <GuardianActor
        action={presentation?.guardianAction ?? 'idle'}
        actionRevision={presentation?.guardianActionRevision ?? 0}
      />
      <WorkshopProbe
        lit={lampLit}
        accent={lampLit && presentation?.lanternAccent === true}
        guardianAction={presentation?.guardianAction ?? 'idle'}
      />
    </group>
  );
}

function GuardianActor({
  action,
  actionRevision,
}: {
  readonly action: 'idle' | 'move' | 'interact' | 'combat' | 'defeat';
  readonly actionRevision: number;
}) {
  const armRef = useRef<Group | null>(null);
  const startedAt = useRef<number | null>(null);
  const previousRevision = useRef(actionRevision);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (actionRevision !== previousRevision.current) {
      previousRevision.current = actionRevision;
      startedAt.current = null;
    }
    if (action !== 'interact' && armRef.current) armRef.current.rotation.z = 0;
  }, [action, actionRevision]);

  useFrame((state) => {
    const arm = armRef.current;
    if (!arm || action !== 'interact') return;
    startedAt.current ??= state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startedAt.current;
    if (elapsed >= 0.7) {
      arm.rotation.z = 0;
      return;
    }
    arm.rotation.z = -Math.sin((elapsed / 0.7) * Math.PI) * 0.85;
    invalidate();
  });

  return (
    <group position={[2.5, 0, -0.4]}>
      <mesh position={[0, 0.65, 0]}>
        <capsuleGeometry args={[0.28, 0.7, 4, 8]} />
        <meshStandardMaterial color="#5f7e91" />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial color="#e4bd91" />
      </mesh>
      <group ref={armRef} position={[-0.24, 1, 0]}>
        <mesh position={[-0.2, -0.14, 0]} rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[0.1, 0.38, 4, 8]} />
          <meshStandardMaterial color="#5f7e91" />
        </mesh>
      </group>
    </group>
  );
}

function WorkshopProbe({
  lit,
  accent,
  guardianAction,
}: {
  readonly lit: boolean;
  readonly accent: boolean;
  readonly guardianAction: string;
}) {
  const probe = sceneProbe();
  if (probe) {
    probe.lampLit = lit;
    probe.lanternAccent = accent;
    probe.guardianAction = guardianAction;
  }
  return null;
}
