import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { transitionGameplay } from 'waypoint-rpg-gameplay';
import type { GameplayCommand } from 'waypoint-rpg-gameplay';
import type { CharacterAnimationSnapshot } from './character-animation.js';
import type { SemanticAction } from './contracts.js';
import {
  applyAnimationProjection,
  createAnimationGameplayDemo,
  createAnimationMoveCommand,
  projectGameplayAnimationChanges,
} from './gameplay-demo.js';
import type { AnimationProjectionState } from './gameplay-demo.js';
import { ModelInstance, type ModelLoadStatus } from './ModelInstance.js';
import { phase5AssetRecords } from './asset-records.js';
import { createModelAssetLoader } from './model-loader.js';

const STATIC_ID = 'phase5-textured-static';
const RIGGED_ID = 'phase5-animated-guardian';
const EXTERNAL_STATIC_ID = 'phase5-khronos-box';
const EXTERNAL_RIGGED_ID = 'phase5-khronos-rigged-figure';
const TRAVELER_INSTANCE_ID = 'traveler';
const GUARDIAN_INSTANCE_ID = 'guardian';

declare global {
  interface Window {
    __phase5ModelProbe?: {
      readonly scene: Scene;
      readonly renderer: WebGLRenderer;
      readonly camera: Camera;
      readonly animationSnapshot?: (instanceId: string) => CharacterAnimationSnapshot | null;
      readonly setAnimationAction?: (
        instanceId: string,
        action: SemanticAction,
        reducedMotion?: boolean,
      ) => boolean;
      readonly advanceAnimation?: (instanceId: string, deltaSeconds: number) => boolean;
    };
  }
}

function createInitialAnimationProjection(): AnimationProjectionState {
  return Object.freeze({
    [TRAVELER_INSTANCE_ID]: Object.freeze({ action: 'idle', revision: 0 }),
    [GUARDIAN_INSTANCE_ID]: Object.freeze({ action: 'idle', revision: 0 }),
  });
}

function participantPosition(
  state: ReturnType<typeof createAnimationGameplayDemo>['state'],
  participantId: string,
): readonly [number, number, number] {
  const position = state.encounter?.combatants.find((item) => item.id === participantId)?.position;
  if (!position) return [0, 0, 0];
  return [(position.x - 3) * 0.48, 0.02, -0.1];
}

function statusAttributes(status: ModelLoadStatus | undefined) {
  if (!status) return { 'data-status': 'loading' };
  if (status.status !== 'ready') return { 'data-status': status.status };
  return {
    'data-status': status.status,
    'data-asset-id': status.assetId,
    'data-load-ms': String(status.loadDurationMs),
    'data-meshes': String(status.meshes),
    'data-skinned-meshes': String(status.skinnedMeshes),
    'data-clips': status.clips.join(','),
  };
}

export function Phase5AssetDemo() {
  const testMode = new URLSearchParams(window.location.search).get('phase5-test') === '1';
  const loader = useMemo(() => {
    if (!testMode) return createModelAssetLoader(phase5AssetRecords);
    const staticRecord = phase5AssetRecords.find((record) => record.id === STATIC_ID);
    if (!staticRecord) throw new Error('The Phase 5 static fixture is missing.');
    return createModelAssetLoader([
      ...phase5AssetRecords,
      { ...staticRecord, id: 'phase5-slow-static' },
      { ...staticRecord, id: 'phase5-error-static' },
    ]);
  }, [testMode]);
  const [statuses, setStatuses] = useState<Readonly<Record<string, ModelLoadStatus>>>({});
  const [viewVersion, setViewVersion] = useState(0);
  const [previewAssetId, setPreviewAssetId] = useState(STATIC_ID);
  const [riggedAssetId, setRiggedAssetId] = useState(RIGGED_ID);
  const [showTraveler, setShowTraveler] = useState(true);
  const [showCharacterInstances, setShowCharacterInstances] = useState(true);
  const [gameplay, setGameplay] = useState(() => createAnimationGameplayDemo());
  const staleMoveCommandRef = useRef<GameplayCommand | null>(null);
  const [actions, setActions] = useState<AnimationProjectionState>(
    createInitialAnimationProjection,
  );
  const [gameplayFeedback, setGameplayFeedback] = useState('');
  const [contextLost, setContextLost] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const sceneProbeRef = useRef<Window['__phase5ModelProbe']>(undefined);
  useEffect(
    () => () => {
      loader.dispose();
      if (window.__phase5ModelProbe === sceneProbeRef.current) delete window.__phase5ModelProbe;
    },
    [loader],
  );
  const onCanvasCreated = useCallback(
    ({ gl, scene, camera }: { gl: WebGLRenderer; scene: Scene; camera: Camera }) => {
      const probe = {
        scene,
        renderer: gl,
        camera,
        ...(testMode
          ? {
              animationSnapshot: (instanceId: string) => {
                const callback = scene.getObjectByName(`phase5:${instanceId}`)?.userData
                  .phase5AnimationSnapshot;
                return typeof callback === 'function'
                  ? (callback() as CharacterAnimationSnapshot | null)
                  : null;
              },
              setAnimationAction: (
                instanceId: string,
                action: SemanticAction,
                reducedMotion = false,
              ) => {
                const control = scene.getObjectByName(`phase5:${instanceId}`)?.userData
                  .phase5AnimationControl;
                if (!control || typeof control.setAction !== 'function') return false;
                control.setAction(action, reducedMotion);
                return true;
              },
              advanceAnimation: (instanceId: string, deltaSeconds: number) => {
                const control = scene.getObjectByName(`phase5:${instanceId}`)?.userData
                  .phase5AnimationControl;
                return typeof control?.advance === 'function'
                  ? Boolean(control.advance(deltaSeconds))
                  : false;
              },
            }
          : {}),
      };
      sceneProbeRef.current = probe;
      window.__phase5ModelProbe = probe;
      gl.domElement.dataset.testid = 'phase5-model-canvas';
      gl.domElement.addEventListener(
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          setContextLost(true);
        },
        { once: true },
      );
    },
    [testMode],
  );
  const onStatus = useCallback((instanceId: string, status: ModelLoadStatus) => {
    setStatuses((current) => ({ ...current, [instanceId]: status }));
  }, []);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);
  const movePlayer = useCallback(() => {
    const command = createAnimationMoveCommand(gameplay.state);
    const result = transitionGameplay(gameplay.compiled, gameplay.state, command);
    if (!result.accepted) {
      setGameplayFeedback(result.reason.message);
      return;
    }
    const updates = projectGameplayAnimationChanges(gameplay.state, result, command);
    staleMoveCommandRef.current = command;
    setGameplay({ compiled: gameplay.compiled, state: result.state });
    setActions((current) => applyAnimationProjection(current, updates));
    setGameplayFeedback(`Accepted movement · revision ${result.state.revision}`);
  }, [gameplay]);
  const rejectStaleMove = useCallback(() => {
    const staleCommand = staleMoveCommandRef.current;
    if (!staleCommand) return;
    const result = transitionGameplay(gameplay.compiled, gameplay.state, staleCommand);
    if (!result.accepted && result.state === gameplay.state) {
      const animationProjection = projectGameplayAnimationChanges(
        gameplay.state,
        result,
        staleCommand,
      );
      setGameplayFeedback(`Rejected stale command · ${result.reason.code}`);
      if (Object.keys(animationProjection).length > 0)
        setActions((current) => applyAnimationProjection(current, animationProjection));
    }
  }, [gameplay]);
  const restartEncounter = useCallback(() => {
    setGameplay(createAnimationGameplayDemo(`phase5-animation-playthrough-${Date.now()}`));
    setActions(createInitialAnimationProjection());
    staleMoveCommandRef.current = null;
    setGameplayFeedback('A new encounter is ready.');
  }, []);
  const traveler = gameplay.state.encounter?.combatants.find((item) => item.id === 'traveler');
  const guardian = gameplay.state.encounter?.combatants.find((item) => item.id === 'guardian');

  return (
    <main className="demo-shell phase5-model-demo" data-testid="phase5-model-demo">
      <header className="demo-header">
        <div>
          <p className="eyebrow">Phase 5 · Local model pipeline</p>
          <h1>Textured and rigged GLB assets</h1>
          <p>
            Local GLBs respond to a real deterministic tactical move and independent character
            mixers.
          </p>
        </div>
        <div className="phase5-model-status" aria-live="polite" aria-label="Model loading status">
          <span>Textured model</span>
          <output
            data-testid="model-status-static"
            {...statusAttributes(statuses['static-preview'])}
          >
            {statuses['static-preview']?.status ?? 'loading'}
          </output>
          <span>Rigged character</span>
          <output
            data-testid="model-status-rigged"
            {...statusAttributes(statuses[TRAVELER_INSTANCE_ID])}
          >
            {statuses[TRAVELER_INSTANCE_ID]?.status ?? 'loading'}
          </output>
          <span>Traveler instance</span>
          <output
            data-testid="model-status-traveler"
            {...statusAttributes(statuses[TRAVELER_INSTANCE_ID])}
          >
            {statuses[TRAVELER_INSTANCE_ID]?.status ?? 'loading'}
          </output>
          <span>Guardian instance</span>
          <output
            data-testid="model-status-guardian"
            {...statusAttributes(statuses[GUARDIAN_INSTANCE_ID])}
          >
            {statuses[GUARDIAN_INSTANCE_ID]?.status ?? 'loading'}
          </output>
        </div>
      </header>

      <section className="controls" aria-label="Model and gameplay controls">
        <label htmlFor="phase5-preview-asset">Preview asset</label>
        <select
          id="phase5-preview-asset"
          data-testid="model-asset-select"
          value={previewAssetId}
          onChange={(event) => setPreviewAssetId(event.currentTarget.value)}
        >
          <option value={STATIC_ID}>Textured static GLB</option>
          <option value={EXTERNAL_STATIC_ID}>Khronos Box · CC BY 4.0</option>
          <option value={EXTERNAL_RIGGED_ID}>Khronos Rigged Figure · CC BY 4.0</option>
          <option value={RIGGED_ID}>Rigged animated GLB</option>
          {testMode && <option value="phase5-slow-static">Delayed static test load</option>}
          {testMode && <option value="phase5-error-static">Failing static test load</option>}
        </select>
        <label htmlFor="phase5-rigged-asset">Character instances</label>
        <select
          id="phase5-rigged-asset"
          data-testid="rigged-asset-select"
          value={riggedAssetId}
          onChange={(event) => setRiggedAssetId(event.currentTarget.value)}
        >
          <option value={RIGGED_ID}>Procedural rigged fixture</option>
          <option value={EXTERNAL_RIGGED_ID}>Khronos Rigged Figure · CC BY 4.0</option>
        </select>
        <button
          data-testid="model-reload"
          type="button"
          onClick={() => setViewVersion((version) => version + 1)}
        >
          Reload models
        </button>
        {testMode && (
          <button
            data-testid="toggle-character-instances"
            type="button"
            onClick={() => setShowCharacterInstances((visible) => !visible)}
          >
            {showCharacterInstances
              ? 'Hide rigged characters test view'
              : 'Show rigged characters test view'}
          </button>
        )}
        {testMode && (
          <button
            data-testid="toggle-traveler-instance"
            type="button"
            onClick={() => setShowTraveler((visible) => !visible)}
          >
            {showTraveler ? 'Unmount traveler test instance' : 'Mount traveler test instance'}
          </button>
        )}
        <button
          data-testid="gameplay-move"
          type="button"
          disabled={gameplay.state.encounter?.outcome !== null || !traveler || !guardian}
          onClick={movePlayer}
        >
          Move through turn-based rules
        </button>
        <button data-testid="gameplay-reset" type="button" onClick={restartEncounter}>
          Restart encounter
        </button>
        {testMode && (
          <button data-testid="gameplay-stale-move" type="button" onClick={rejectStaleMove}>
            Submit stale move test
          </button>
        )}
        <button
          data-testid="return-to-story"
          type="button"
          onClick={() => {
            window.location.search = '';
          }}
        >
          Return to the story
        </button>
        <output data-testid="gameplay-revision">Revision {gameplay.state.revision}</output>
        <output data-testid="gameplay-traveler-position">
          Traveler cell {traveler?.position.x},{traveler?.position.y}
        </output>
        <output data-testid="gameplay-guardian-position">
          Guardian cell {guardian?.position.x},{guardian?.position.y}
        </output>
        <output data-testid="animation-action-traveler">
          Traveler action {actions[TRAVELER_INSTANCE_ID]?.action ?? 'idle'}
        </output>
        <output data-testid="animation-action-guardian">
          Guardian action {actions[GUARDIAN_INSTANCE_ID]?.action ?? 'idle'}
        </output>
        <output data-testid="animation-revision-traveler">
          Traveler animation revision {actions[TRAVELER_INSTANCE_ID]?.revision ?? 0}
        </output>
        <output data-testid="animation-revision-guardian">
          Guardian animation revision {actions[GUARDIAN_INSTANCE_ID]?.revision ?? 0}
        </output>
        <output data-testid="reduced-motion-state" data-reduced-motion={String(reducedMotion)}>
          {reducedMotion ? 'Reduced motion' : 'Full motion'}
        </output>
        <output data-testid="gameplay-feedback" role="status" aria-live="polite">
          {gameplayFeedback}
        </output>
        {Object.values(statuses).some((status) => status.status === 'error') && (
          <output role="status" data-testid="model-load-error">
            {Object.values(statuses)
              .filter((status) => status.status === 'error')
              .map((status) => status.message)
              .join(' · ')}
          </output>
        )}
      </section>

      <section
        className="scene-stage phase5-model-stage"
        aria-label="Imported 3D model and animation preview"
      >
        {contextLost && (
          <section className="phase5-context-recovery" role="alert">
            <p>3D preview paused. Reload the local models to continue.</p>
            <button
              data-testid="phase5-context-recover"
              type="button"
              onClick={() => {
                setContextLost(false);
                setViewVersion((version) => version + 1);
              }}
            >
              Recover 3D preview
            </button>
          </section>
        )}
        <Canvas
          key={viewVersion}
          frameloop="demand"
          camera={{ position: [0, 3.1, 7], fov: 42 }}
          onCreated={onCanvasCreated}
        >
          <color attach="background" args={['#d9e9ec']} />
          <ambientLight intensity={1.3} />
          <directionalLight position={[3, 5, 4]} intensity={2} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
            <planeGeometry args={[7, 4]} />
            <meshStandardMaterial color="#83a78c" />
          </mesh>
          <Suspense fallback={null}>
            <ModelInstance
              instanceId="static-preview"
              assetId={previewAssetId}
              loader={loader}
              position={[0, 0.02, 1.1]}
              action="idle"
              actionRevision={0}
              reducedMotion={reducedMotion}
              onStatus={onStatus}
            />
            {showCharacterInstances && (showTraveler || !testMode) && (
              <ModelInstance
                instanceId={TRAVELER_INSTANCE_ID}
                key={`${TRAVELER_INSTANCE_ID}:${viewVersion}`}
                assetId={riggedAssetId}
                loader={loader}
                position={participantPosition(gameplay.state, 'traveler')}
                action={actions[TRAVELER_INSTANCE_ID]?.action ?? 'idle'}
                actionRevision={actions[TRAVELER_INSTANCE_ID]?.revision ?? 0}
                reducedMotion={reducedMotion}
                onStatus={onStatus}
              />
            )}
            {showCharacterInstances && (
              <ModelInstance
                instanceId={GUARDIAN_INSTANCE_ID}
                key={`${GUARDIAN_INSTANCE_ID}:${viewVersion}`}
                assetId={riggedAssetId}
                loader={loader}
                position={participantPosition(gameplay.state, 'guardian')}
                action={actions[GUARDIAN_INSTANCE_ID]?.action ?? 'idle'}
                actionRevision={actions[GUARDIAN_INSTANCE_ID]?.revision ?? 0}
                reducedMotion={reducedMotion}
                onStatus={onStatus}
              />
            )}
          </Suspense>
        </Canvas>
      </section>
      <p className="phase5-model-provenance">
        The procedural fixtures are covered by this repository’s MIT license. The optional Box and
        Rigged Figure samples are © 2017 Cesium under CC BY 4.0; see the attribution and pinned
        source revision in the scene-demo README. The two character instances own separate skeletons
        and mixers; the move control commits a Phase 4 gameplay transition before selecting their
        movement clips. Import records include hashes, provenance, budgets, and animation inventory.
      </p>
    </main>
  );
}
