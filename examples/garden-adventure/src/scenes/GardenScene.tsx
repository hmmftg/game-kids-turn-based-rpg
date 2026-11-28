import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, Vector3, type Group } from 'three';
import { getFact } from 'waypoint-rpg-narrative';
import { getAnchor, type AnchorId } from 'waypoint-rpg-core';
import type { SemanticAction, TimelineEvent } from 'waypoint-rpg-three';
import type { GardenRuntime, GardenState, GardenWalk } from '../game/runtime.js';
import { commitRenderedArrival } from '../game/rendered-arrival.js';
import {
  gardenTargets,
  gardenGraphs,
  type GardenMapId,
  type GardenTarget,
} from '../world/world.js';
import { SceneCamera } from './SceneCamera.js';
import { isGardenMeshyPilotRequested, MeshyModelVisual } from './MeshyPilot.js';
import { GardenModelVisual } from '../models/GardenModel.js';
import {
  gardenModelInstanceIdForTarget,
  gardenPlayerModelInstanceId,
} from '../models/asset-records.js';
import { GARDEN_MODEL_TARGET_KIND } from '../models/model-binding-validation.js';
import { GardenEndingCinematic } from '../presentation/GardenEndingCinematic.js';
import type { GardenEndingId } from '../presentation/ending-cinematic.js';
import { sceneForMap } from './registry.js';
import {
  currentGardenProbe,
  type GardenRendererResourceProbe,
  type GardenSceneReadiness,
} from './probe.js';

interface GardenSceneProps {
  readonly runtime: GardenRuntime;
  readonly state: GardenState;
  readonly sceneGeneration: number;
  readonly onTargetPress: (targetId: GardenTarget['id']) => void;
  readonly onSceneReady: (readiness: GardenSceneReadiness) => void;
  readonly cinematicRequest: {
    readonly endingId: GardenEndingId;
    readonly requestId: string;
  } | null;
  readonly cinematicActions: Readonly<Record<string, SemanticAction>>;
  readonly onCinematicEvent: (event: TimelineEvent) => void;
  readonly onCinematicComplete: (requestId: string) => void;
}

export function GardenScene({
  runtime,
  state,
  sceneGeneration,
  onTargetPress,
  onSceneReady,
  cinematicRequest,
  cinematicActions,
  onCinematicEvent,
  onCinematicComplete,
}: GardenSceneProps) {
  const definition = sceneForMap(state.mapId);
  const entry = getAnchor(definition.graph, state.anchorId);
  const targets = gardenTargets.filter((target) => target.mapId === state.mapId);
  const treeGrown = getFact(state.narrative, 'tree-grown') === true;
  const lanternLit = getFact(state.narrative, 'lantern-lit') === true;
  const guardianAction =
    cinematicActions.guardian ??
    (lanternLit ? 'interact' : state.gameplay.encounter?.outcome === null ? 'combat' : 'idle');

  return (
    <group name={`garden-scene-${state.mapId}`}>
      <SceneCamera mapId={state.mapId} anchorId={state.anchorId} />
      {cinematicRequest && state.mapId === 'garden' ? (
        <GardenEndingCinematic
          key={cinematicRequest.requestId}
          endingId={cinematicRequest.endingId}
          requestId={cinematicRequest.requestId}
          onEvent={onCinematicEvent}
          onComplete={onCinematicComplete}
        />
      ) : null}
      <ContextRecovery />
      <RendererResourceProbe mapId={state.mapId} sceneGeneration={sceneGeneration} />
      <SceneProbe
        mapId={state.mapId}
        anchorId={state.anchorId}
        walk={state.walk}
        runtime={runtime}
        sceneGeneration={sceneGeneration}
        playthroughId={state.narrative.playthroughId}
        treeGrown={treeGrown}
        lanternLit={lanternLit}
        onSceneReady={onSceneReady}
      />
      <color attach="background" args={[state.mapId === 'village' ? '#c7e2cf' : '#a9c8aa']} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[4, 12, 7]} intensity={2.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[17, 15]} />
        <meshStandardMaterial color={state.mapId === 'village' ? '#819c69' : '#71875f'} />
      </mesh>
      <Pathway mapId={state.mapId} />
      <LandmarkDecorations mapId={state.mapId} treeGrown={treeGrown} />
      {targets.map((target) => (
        <WorldTarget
          key={target.id}
          target={target}
          onPress={onTargetPress}
          lanternLit={lanternLit}
          guardianAction={guardianAction}
        />
      ))}
      <PlayerCharacter
        anchorId={state.anchorId}
        anchor={entry}
        walk={state.walk}
        playthroughId={state.narrative.playthroughId}
        mapId={state.mapId}
        action={cinematicActions.hero ?? (state.walk ? 'move' : 'idle')}
      />
    </group>
  );
}

function RendererResourceProbe({
  mapId,
  sceneGeneration,
}: {
  readonly mapId: GardenMapId;
  readonly sceneGeneration: number;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const rendererProbeRequested =
      new URLSearchParams(window.location.search).get('rendererprobe') === '1';
    if (!import.meta.env.DEV && !isGardenMeshyPilotRequested() && !rendererProbeRequested) return;
    const probe: GardenRendererResourceProbe = {
      sample: () => ({
        mapId,
        sceneGeneration,
        geometryCount: gl.info.memory.geometries,
        textureCount: gl.info.memory.textures,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        sampledAt: performance.now(),
      }),
    };
    window.__gardenRendererResourceProbe = probe;
    return () => {
      if (window.__gardenRendererResourceProbe === probe)
        delete window.__gardenRendererResourceProbe;
    };
  }, [gl, mapId, sceneGeneration]);

  return null;
}

function ContextRecovery() {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const onContextRestored = () => invalidate();
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    return () => canvas.removeEventListener('webglcontextrestored', onContextRestored);
  }, [gl, invalidate]);

  return null;
}

function SceneProbe({
  mapId,
  anchorId,
  walk,
  runtime,
  sceneGeneration,
  playthroughId,
  treeGrown,
  lanternLit,
  onSceneReady,
}: {
  readonly mapId: GardenMapId;
  readonly anchorId: string;
  readonly walk: GardenWalk | null;
  readonly runtime: GardenRuntime;
  readonly sceneGeneration: number;
  readonly playthroughId: string;
  readonly treeGrown: boolean;
  readonly lanternLit: boolean;
  readonly onSceneReady: GardenSceneProps['onSceneReady'];
}) {
  const { camera, scene, gl, invalidate, size } = useThree();
  const firstRenderedFrameKey = useRef('');
  const reportedReadyKey = useRef('');
  const arrivalCandidateKey = useRef('');
  const arrivalCandidateFrameCount = useRef<number | null>(null);
  const reportedArrivalKey = useRef('');
  const readinessKey = `${mapId}:${anchorId}:${playthroughId}`;
  const walkTargetAnchorId = walk?.path[walk.nextIndex] ?? null;

  useEffect(() => {
    let visibleMeshCount = 0;
    scene.traverse((object) => {
      if (object.type === 'Mesh' && object.visible) visibleMeshCount += 1;
    });
    const cleanupCount = currentGardenProbe()?.cleanupCount ?? 0;
    const existingProbe = currentGardenProbe();
    camera.updateMatrixWorld(true);
    const targetPoints = Object.fromEntries(
      gardenTargets
        .filter((target) => target.mapId === mapId)
        .map((target) => {
          const point = new Vector3(target.position[0], 0.9, target.position[2]).project(camera);
          return [
            target.id,
            { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height },
          ];
        }),
    );
    const probe = {
      activeMap: mapId,
      activeAnchor: anchorId,
      playthroughId,
      sceneGeneration,
      cameraKind:
        camera instanceof OrthographicCamera ? ('orthographic' as const) : ('unknown' as const),
      visibleMeshCount,
      frameCount: 0,
      totalFrameCount: existingProbe?.totalFrameCount ?? 0,
      cleanupCount,
      playerPosition: { x: Number.NaN, z: Number.NaN },
      playerAtAnchor: false,
      walkRouteId: walk?.routeId ?? null,
      walkTargetAnchor: walkTargetAnchorId,
      playerAtWalkTarget: false,
      arrivalReports:
        existingProbe?.playthroughId === playthroughId ? existingProbe.arrivalReports : [],
      targetPoints,
      renderedConsequences: [
        ...(treeGrown && scene.getObjectByName('garden-grown-tree')?.visible
          ? ['grown-tree' as const]
          : []),
        ...(lanternLit && scene.getObjectByName('lantern-warm-light')?.visible
          ? ['lit-lantern' as const]
          : []),
      ],
    };
    window.__gardenProbe = probe;
    invalidate();

    return () => {
      const previous = window.__gardenProbe;
      if (previous === probe) {
        window.__gardenProbe = { ...probe, cleanupCount: probe.cleanupCount + 1 };
      }
    };
  }, [
    anchorId,
    camera,
    gl,
    invalidate,
    lanternLit,
    mapId,
    playthroughId,
    sceneGeneration,
    scene,
    size.height,
    size.width,
    treeGrown,
    walk?.routeId,
    walk?.nextIndex,
    walkTargetAnchorId,
  ]);

  useEffect(() => {
    firstRenderedFrameKey.current = '';
    reportedReadyKey.current = '';
    invalidate();
  }, [invalidate, readinessKey]);

  useEffect(() => {
    arrivalCandidateKey.current = '';
    arrivalCandidateFrameCount.current = null;
    reportedArrivalKey.current = '';
    invalidate();
  }, [invalidate, walk?.routeId, walk?.nextIndex, walkTargetAnchorId]);

  useFrame(() => {
    const probe = currentGardenProbe();
    if (
      probe?.activeMap !== mapId ||
      probe.activeAnchor !== anchorId ||
      probe.playthroughId !== playthroughId
    )
      return;

    const player = scene.getObjectByName('garden-player');
    if (!player) return;
    scene.updateMatrixWorld(true);
    const playerPosition = player.getWorldPosition(new Vector3());
    const anchor = getAnchor(gardenGraphs[mapId], anchorId as AnchorId);
    const playerAtAnchor =
      Math.hypot(playerPosition.x - anchor.x, playerPosition.z - anchor.z) < 0.02;
    const walkTarget = walkTargetAnchorId
      ? getAnchor(gardenGraphs[mapId], walkTargetAnchorId as AnchorId)
      : null;
    const playerAtWalkTarget =
      walkTarget !== null &&
      Math.hypot(playerPosition.x - walkTarget.x, playerPosition.z - walkTarget.z) < 0.02;
    const frameCount = probe.frameCount + 1;
    window.__gardenProbe = {
      ...probe,
      frameCount,
      totalFrameCount: probe.totalFrameCount + 1,
      playerPosition: { x: playerPosition.x, z: playerPosition.z },
      playerAtAnchor,
      walkRouteId: walk?.routeId ?? null,
      walkTargetAnchor: walkTargetAnchorId,
      playerAtWalkTarget,
    };

    const arrivalKey =
      walk && walkTargetAnchorId
        ? `${playthroughId}:${walk.routeId}:${walk.nextIndex}:${walkTargetAnchorId}`
        : '';
    if (!arrivalKey || !playerAtWalkTarget) {
      if (arrivalCandidateKey.current === arrivalKey) {
        arrivalCandidateKey.current = '';
        arrivalCandidateFrameCount.current = null;
      }
      if (!arrivalKey) reportedArrivalKey.current = '';
    } else if (walk && walkTargetAnchorId && reportedArrivalKey.current !== arrivalKey) {
      if (arrivalCandidateKey.current !== arrivalKey) {
        arrivalCandidateKey.current = arrivalKey;
        arrivalCandidateFrameCount.current = frameCount;
        invalidate();
      } else {
        const candidateFrameCount = arrivalCandidateFrameCount.current ?? frameCount;
        const report = {
          routeId: walk.routeId,
          targetAnchor: walkTargetAnchorId,
          committedAnchor: anchorId,
          nextIndex: walk.nextIndex,
          playerAtTarget: true,
          candidateFrameCount,
          renderedFrameGap: frameCount - candidateFrameCount,
          frameCount,
        };
        const currentProbe = currentGardenProbe();
        if (currentProbe?.playthroughId === playthroughId) {
          window.__gardenProbe = {
            ...currentProbe,
            arrivalReports: [...currentProbe.arrivalReports, report].slice(-16),
          };
        }
        reportedArrivalKey.current = arrivalKey;
        const arrival = {
          mapId,
          committedAnchor: anchorId as GardenState['anchorId'],
          playthroughId,
          routeId: walk.routeId,
          nextIndex: walk.nextIndex,
          targetAnchor: walkTargetAnchorId as GardenState['anchorId'],
        };
        queueMicrotask(() => {
          commitRenderedArrival(runtime, arrival);
        });
      }
    }

    if (firstRenderedFrameKey.current !== readinessKey) {
      firstRenderedFrameKey.current = readinessKey;
      invalidate();
      return;
    }
    if (
      !playerAtAnchor ||
      !(camera instanceof OrthographicCamera) ||
      probe.visibleMeshCount === 0 ||
      gl.getContext().isContextLost()
    ) {
      invalidate();
      return;
    }
    if (reportedReadyKey.current !== readinessKey) {
      reportedReadyKey.current = readinessKey;
      onSceneReady({
        mapId,
        anchorId,
        playthroughId,
        cameraKind: 'orthographic',
        frameCount,
        visibleMeshCount: probe.visibleMeshCount,
        playerAtAnchor,
      });
    }

    if (walk) invalidate();
  });

  return null;
}

function Pathway({ mapId }: { readonly mapId: GardenMapId }) {
  const stoneColor = mapId === 'village' ? '#c6b58c' : '#b8bb98';
  const segments =
    mapId === 'village'
      ? [
          { position: [0, -0.04, 0.2] as const, rotation: 0, size: [1.5, 8] as const },
          { position: [0, -0.04, -3.2] as const, rotation: Math.PI / 2, size: [1.5, 5] as const },
        ]
      : [
          { position: [0, -0.04, 0.2] as const, rotation: 0, size: [1.5, 8] as const },
          { position: [0, -0.04, -3.5] as const, rotation: Math.PI / 2, size: [1.5, 5] as const },
        ];

  return (
    <group>
      {segments.map((segment, index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, segment.rotation]}
          position={segment.position}
        >
          <planeGeometry args={segment.size} />
          <meshStandardMaterial color={stoneColor} />
        </mesh>
      ))}
    </group>
  );
}

function LandmarkDecorations({
  mapId,
  treeGrown,
}: {
  readonly mapId: GardenMapId;
  readonly treeGrown: boolean;
}) {
  if (mapId === 'village') {
    return (
      <group>
        <SimpleTree position={[-6.2, 0, 3.4]} leafColor="#467d4b" />
        <SimpleTree position={[6.2, 0, 3.4]} leafColor="#5c8d4a" />
        <SimpleTree position={[-6.5, 0, -4.3]} leafColor="#60924e" />
      </group>
    );
  }
  return (
    <group>
      <SimpleTree position={[-6.1, 0, -4.5]} leafColor="#547b46" />
      <SimpleTree position={[6.1, 0, -4.5]} leafColor="#637f45" />
      <SimpleTree position={[-6.1, 0, 3.3]} leafColor="#4a7446" />
      <SimpleTree position={[6.1, 0, 3.3]} leafColor="#718947" />
      {treeGrown ? <BlossomTree position={[-2.2, 0, -1.8]} /> : null}
      <group position={[6, 0, -1.5]} name="garden-shrine">
        <MeshyModelVisual modelKey="shrine">
          <ShrineFallback />
        </MeshyModelVisual>
      </group>
    </group>
  );
}

function SimpleTree({
  position,
  leafColor,
}: {
  readonly position: [number, number, number];
  readonly leafColor: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 1.5, 8]} />
        <meshStandardMaterial color="#78563b" />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color={leafColor} />
      </mesh>
    </group>
  );
}

function PlayerCharacter({
  anchorId,
  anchor,
  walk,
  playthroughId,
  mapId,
  action,
}: {
  readonly anchorId: string;
  readonly anchor: { readonly x: number; readonly z: number };
  readonly walk: GardenWalk | null;
  readonly playthroughId: string;
  readonly mapId: GardenMapId;
  readonly action: SemanticAction;
}) {
  const groupRef = useRef<Group>(null);
  const elapsed = useRef(0);
  const activeStepKey = useRef('');
  const { invalidate } = useThree();
  const targetAnchorId = walk?.path[walk.nextIndex] ?? null;
  const target = targetAnchorId ? getAnchor(gardenGraphs[mapId], targetAnchorId as AnchorId) : null;
  const stepKey =
    walk && targetAnchorId
      ? `${playthroughId}:${mapId}:${walk.routeId}:${walk.nextIndex}:${anchorId}:${targetAnchorId}`
      : '';

  useFrame((_frame, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (!walk || !target || !stepKey) {
      activeStepKey.current = '';
      elapsed.current = 0;
      group.position.set(anchor.x, 0, anchor.z);
      return;
    }
    if (activeStepKey.current !== stepKey) {
      activeStepKey.current = stepKey;
      elapsed.current = 0;
      group.position.set(anchor.x, 0, anchor.z);
    }
    elapsed.current += delta;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const progress = reducedMotion ? 1 : Math.min(1, elapsed.current / 0.18);
    group.position.set(
      anchor.x + (target.x - anchor.x) * progress,
      0,
      anchor.z + (target.z - anchor.z) * progress,
    );
    // Keep demand rendering alive until SceneProbe confirms the arrival on a
    // subsequent rendered frame and commits the corresponding ARRIVE command.
    invalidate();
  });

  return (
    <group ref={groupRef} position={[anchor.x, 0, anchor.z]} name="garden-player">
      <GardenModelVisual
        instanceId={gardenPlayerModelInstanceId()}
        mapId={mapId}
        action={action}
        modelPosition={[0, 0.7, 0]}
        modelScale={[1.2, 1.2, 1.2]}
      >
        <group>
          <mesh position={[0, 0.68, 0]} castShadow>
            <capsuleGeometry args={[0.28, 0.65, 4, 10]} />
            <meshStandardMaterial color="#c37850" />
          </mesh>
          <mesh position={[0, 1.35, 0]} castShadow>
            <sphereGeometry args={[0.26, 12, 10]} />
            <meshStandardMaterial color="#e8b68d" />
          </mesh>
        </group>
      </GardenModelVisual>
    </group>
  );
}

function WorldTarget({
  target,
  onPress,
  lanternLit,
  guardianAction,
}: {
  readonly target: GardenTarget;
  readonly onPress: GardenSceneProps['onTargetPress'];
  readonly lanternLit: boolean;
  readonly guardianAction: SemanticAction;
}) {
  const click = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onPress(target.id);
  };

  return (
    <group position={target.position} name={`world-target-${target.id}`}>
      <TargetModel
        kind={target.kind}
        mapId={target.mapId}
        lanternLit={lanternLit}
        guardianAction={guardianAction}
      />
      <mesh position={[0, 0.9, 0]} onClick={click}>
        <sphereGeometry args={[0.9, 12, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function TargetModel({
  kind,
  mapId,
  lanternLit,
  guardianAction,
}: {
  readonly kind: GardenTarget['kind'];
  readonly mapId: GardenMapId;
  readonly lanternLit: boolean;
  readonly guardianAction: SemanticAction;
}) {
  if (kind === 'fountain')
    return (
      <MeshyModelVisual modelKey="fountain">
        <FountainModel />
      </MeshyModelVisual>
    );
  if (kind === 'market') return <MarketModel />;
  if (kind === 'basket') return <BasketModel />;
  if (kind === 'gardener') return <NpcModel traveler={false} />;
  if (kind === 'traveler')
    return (
      <MeshyModelVisual modelKey="sage">
        <NpcModel traveler />
      </MeshyModelVisual>
    );
  if (kind === 'gate') return <GateModel />;
  if (kind === 'bed') return <PlantBedModel />;
  if (kind === 'stone') return <ClueStoneModel />;
  if (kind === 'guardian')
    return (
      <MeshyModelVisual modelKey="guardian">
        <GardenModelVisual
          instanceId={gardenModelInstanceIdForTarget(GARDEN_MODEL_TARGET_KIND.guardian)}
          mapId={mapId}
          action={guardianAction}
          modelPosition={[0, 0.7, 0]}
          modelScale={[1.2, 1.2, 1.2]}
        >
          <GuardianModel />
        </GardenModelVisual>
      </MeshyModelVisual>
    );
  if (kind === 'lantern') return <LanternModel lit={lanternLit} mapId={mapId} />;
  return <BenchModel />;
}

function GuardianModel() {
  return (
    <group>
      <mesh position={[0, 0.44, 0]} castShadow>
        <dodecahedronGeometry args={[0.64, 1]} />
        <meshStandardMaterial color="#83a8a3" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <sphereGeometry args={[0.43, 16, 12]} />
        <meshStandardMaterial color="#a7c9bb" roughness={0.68} />
      </mesh>
      <mesh position={[-0.17, 1.31, 0.37]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshBasicMaterial color="#415b57" />
      </mesh>
      <mesh position={[0.17, 1.31, 0.37]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshBasicMaterial color="#415b57" />
      </mesh>
    </group>
  );
}

function FountainModel() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[1, 1.12, 0.5, 20]} />
        <meshStandardMaterial color="#b6a486" />
      </mesh>
      <mesh position={[0, 0.53, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.08, 20]} />
        <meshStandardMaterial color="#8cc5c1" roughness={0.24} />
      </mesh>
    </group>
  );
}

function MarketModel() {
  return (
    <group>
      <mesh position={[0, 1.45, 0]} castShadow>
        <boxGeometry args={[2.4, 0.28, 1.4]} />
        <meshStandardMaterial color="#dfaa67" />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.68, 0]}>
          <cylinderGeometry args={[0.08, 0.09, 1.3, 8]} />
          <meshStandardMaterial color="#805a3f" />
        </mesh>
      ))}
      <mesh position={[0, 0.48, -0.3]}>
        <boxGeometry args={[1.9, 0.4, 0.5]} />
        <meshStandardMaterial color="#9a7248" />
      </mesh>
    </group>
  );
}

function BasketModel() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.55, 0.42, 0.65, 12, 1, true]} />
        <meshStandardMaterial color="#a87945" side={2} />
      </mesh>
      <mesh position={[0, 0.78, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.06, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#805a37" />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshStandardMaterial color="#d9b168" />
      </mesh>
    </group>
  );
}

function NpcModel({ traveler }: { readonly traveler: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.64, 0]} castShadow>
        <capsuleGeometry args={[0.38, 0.7, 4, 10]} />
        <meshStandardMaterial color={traveler ? '#587c79' : '#75904e'} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshStandardMaterial color="#e3b58d" />
      </mesh>
      <mesh position={[0, 1.76, 0]}>
        <coneGeometry args={[0.42, 0.38, 10]} />
        <meshStandardMaterial color={traveler ? '#b16f4b' : '#d1b25d'} />
      </mesh>
    </group>
  );
}

function GateModel() {
  return (
    <group>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 1, 0]} castShadow>
          <boxGeometry args={[0.24, 2, 0.28]} />
          <meshStandardMaterial color="#846345" />
        </mesh>
      ))}
      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[1.9, 0.26, 0.3]} />
        <meshStandardMaterial color="#926b48" />
      </mesh>
      <mesh position={[0, 1.55, 0.03]}>
        <boxGeometry args={[1.2, 0.42, 0.08]} />
        <meshStandardMaterial color="#b5c88d" />
      </mesh>
    </group>
  );
}

function PlantBedModel() {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[2.8, 0.35, 1.7]} />
        <meshStandardMaterial color="#71563f" />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[2.55, 0.12, 1.45]} />
        <meshStandardMaterial color="#694b37" />
      </mesh>
    </group>
  );
}

function ClueStoneModel() {
  return (
    <mesh position={[0, 0.65, 0]} rotation={[0.16, 0.15, 0]} castShadow>
      <dodecahedronGeometry args={[0.95, 0]} />
      <meshStandardMaterial color="#948c79" roughness={0.92} />
    </mesh>
  );
}

function LanternModel({ lit, mapId }: { readonly lit: boolean; readonly mapId: GardenMapId }) {
  return (
    <group>
      <group position={[0, 0.12, 0]} scale={[1.25, 0.18, 1.25]}>
        <GardenModelVisual
          instanceId={gardenModelInstanceIdForTarget(GARDEN_MODEL_TARGET_KIND.lantern)}
          mapId={mapId}
        >
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#967d59" />
          </mesh>
        </GardenModelVisual>
      </group>
      {lit ? (
        <pointLight
          name="lantern-warm-light"
          position={[0, 2.45, 0]}
          color="#ffd875"
          intensity={2.4}
          distance={7}
        />
      ) : null}
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 2.2, 8]} />
        <meshStandardMaterial color="#6f573d" />
      </mesh>
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[0.65, 0.75, 0.55]} />
        <meshStandardMaterial color="#8e7751" />
      </mesh>
      <mesh position={[0, 2.4, 0.01]}>
        <boxGeometry args={[0.4, 0.5, 0.39]} />
        <meshStandardMaterial
          color={lit ? '#fff0a6' : '#c7a763'}
          emissive={lit ? '#ffc943' : '#000000'}
          emissiveIntensity={lit ? 1.4 : 0}
        />
      </mesh>
    </group>
  );
}

function BlossomTree({ position }: { readonly position: [number, number, number] }) {
  return (
    <group position={position} name="garden-grown-tree">
      <MeshyModelVisual modelKey="blossomTree">
        <BlossomTreeFallback />
      </MeshyModelVisual>
    </group>
  );
}

function BlossomTreeFallback() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 1.8, 8]} />
        <meshStandardMaterial color="#805637" />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <sphereGeometry args={[1.05, 18, 14]} />
        <meshStandardMaterial color="#5e9b58" />
      </mesh>
      <mesh position={[-0.5, 2.2, 0.65]}>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshStandardMaterial color="#f2c8c0" />
      </mesh>
      <mesh position={[0.46, 2.55, 0.54]}>
        <sphereGeometry args={[0.3, 12, 10]} />
        <meshStandardMaterial color="#f7e0a0" />
      </mesh>
    </group>
  );
}

function ShrineFallback() {
  return (
    <group>
      <mesh position={[-0.55, 0.8, 0]} castShadow>
        <boxGeometry args={[0.22, 1.6, 0.24]} />
        <meshStandardMaterial color="#bf9a79" />
      </mesh>
      <mesh position={[0.55, 0.8, 0]} castShadow>
        <boxGeometry args={[0.22, 1.6, 0.24]} />
        <meshStandardMaterial color="#bf9a79" />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <boxGeometry args={[1.35, 0.22, 0.28]} />
        <meshStandardMaterial color="#d3a5a9" />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[1.6, 0.3, 0.55]} />
        <meshStandardMaterial color="#c6a489" />
      </mesh>
    </group>
  );
}

function BenchModel() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.9, 0.18, 0.65]} />
        <meshStandardMaterial color="#95663f" />
      </mesh>
      <mesh position={[0, 0.95, -0.23]}>
        <boxGeometry args={[1.9, 0.56, 0.16]} />
        <meshStandardMaterial color="#a9784b" />
      </mesh>
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.28, 0]}>
          <boxGeometry args={[0.16, 0.58, 0.18]} />
          <meshStandardMaterial color="#704e33" />
        </mesh>
      ))}
    </group>
  );
}
