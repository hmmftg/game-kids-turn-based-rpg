import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AnimationMixer,
  Box3,
  Box3Helper,
  Color,
  LoopRepeat,
  Vector3,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type {
  ModelAssetRecord,
  SemanticAction,
} from '../../../../examples/scene-demo/src/animation/contracts.js';
import { validateModelAssetRecord } from '../../../../examples/scene-demo/src/animation/contracts.js';
import type {
  ModelAssetLoader,
  ModelLease,
} from '../../../../examples/scene-demo/src/animation/model-loader.js';
import { createModelAssetLoader } from '../../../../examples/scene-demo/src/animation/model-loader.js';
import fixtureRecords from '../../../../examples/scene-demo/src/animation/asset-records.json';
import './preview.css';

const SEMANTIC_ACTIONS: readonly SemanticAction[] = [
  'idle',
  'move',
  'interact',
  'combat',
  'defeat',
];
const ACTION_LABELS: Readonly<Record<SemanticAction, string>> = {
  idle: 'Idle',
  move: 'Movement',
  interact: 'Interaction',
  combat: 'Combat',
  defeat: 'Defeat',
};

type LoadStatus = 'loading' | 'ready' | 'error';
interface InstanceStatus {
  readonly status: LoadStatus;
  readonly message?: string;
  readonly meshes?: number;
  readonly skinnedMeshes?: number;
  readonly clips?: readonly string[];
}

interface PreviewProbe {
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly camera: Camera;
}

declare global {
  interface Window {
    __creatorPreviewProbe?: PreviewProbe;
  }
}

const defaultRecords = fixtureRecords as unknown as readonly ModelAssetRecord[];

function previewLoaderRecords(records: readonly ModelAssetRecord[]): readonly ModelAssetRecord[] {
  return records.map((record) => ({
    ...record,
    // The scene-demo loader is a release consumer and requires approved records.
    // This transient copy is only for local technical preview; the authored rights
    // shown in the UI and catalog are never changed or written back.
    rights: { ...record.rights, approved: true },
  }));
}

async function readRecordsFromUrl(manifestUrl: string): Promise<readonly ModelAssetRecord[]> {
  const url = new URL(manifestUrl, window.location.href);
  if (url.origin !== window.location.origin)
    throw new Error('Preview manifests must be loaded from this local origin.');
  const response = await globalThis.fetch(url, {
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Could not read local model manifest (${response.status}).`);
  const parsed: unknown = await response.json();
  if (!Array.isArray(parsed))
    throw new Error('Model manifest must contain an array of asset records.');
  for (const [index, record] of parsed.entries()) {
    const diagnostics = validateModelAssetRecord({
      ...(record as ModelAssetRecord),
      rights: { ...(record as ModelAssetRecord).rights, approved: true },
    });
    if (diagnostics.length > 0)
      throw new Error(
        `Manifest record ${index + 1} is invalid: ${diagnostics.map((item) => item.path).join(', ')}.`,
      );
  }
  return parsed as ModelAssetRecord[];
}

function defaultAsset(records: readonly ModelAssetRecord[]): ModelAssetRecord {
  return records.find((record) => record.metrics.jointCount === 0) ?? records[0];
}

function loadStatusText(status: InstanceStatus | undefined): string {
  if (!status) return 'Waiting';
  if (status.status === 'error') return `Error · ${status.message ?? 'Unknown load error'}`;
  return status.status === 'ready' ? `Ready · ${status.meshes} meshes` : 'Loading';
}

function Bounds({
  record,
  position,
}: {
  readonly record: ModelAssetRecord;
  readonly position: readonly [number, number, number];
}) {
  const helper = useMemo(() => {
    const box = new Box3(new Vector3(...record.bounds.min), new Vector3(...record.bounds.max));
    const next = new Box3Helper(box, new Color('#cb7545'));
    next.position.set(...position);
    return next;
  }, [position, record]);
  useEffect(
    () => () => {
      helper.geometry.dispose();
      const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
      for (const material of materials) material.dispose();
    },
    [helper],
  );
  return <primitive object={helper} dispose={null} />;
}

function PreviewModel({
  assetId,
  instanceId,
  loader,
  clipName,
  reducedMotion,
  position,
  onStatus,
}: {
  readonly assetId: string;
  readonly instanceId: string;
  readonly loader: ModelAssetLoader;
  readonly clipName: string | undefined;
  readonly reducedMotion: boolean;
  readonly position: readonly [number, number, number];
  readonly onStatus: (id: string, status: InstanceStatus) => void;
}) {
  const [loaded, setLoaded] = useState<{
    readonly assetId: string;
    readonly loader: ModelAssetLoader;
    readonly lease: ModelLease;
  } | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const matches = loaded?.assetId === assetId && loaded.loader === loader ? loaded.lease : null;

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let ownedLease: ModelLease | null = null;
    onStatus(instanceId, { status: 'loading' });
    void loader
      .load(assetId, controller.signal)
      .then((lease) => {
        if (!mounted || controller.signal.aborted) {
          lease.release();
          return;
        }
        ownedLease = lease;
        lease.root.name = `creator-preview:${assetId}:${instanceId}`;
        lease.root.userData.creatorPreviewInstanceId = instanceId;
        let meshes = 0;
        let skinnedMeshes = 0;
        lease.root.traverse((object) => {
          if ((object as { isMesh?: boolean }).isMesh) meshes += 1;
          if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinnedMeshes += 1;
        });
        setLoaded({ assetId, loader, lease });
        onStatus(instanceId, {
          status: 'ready',
          meshes,
          skinnedMeshes,
          clips: lease.clips.map((clip) => clip.name),
        });
        invalidate();
      })
      .catch((error: unknown) => {
        if (!mounted || controller.signal.aborted) return;
        onStatus(instanceId, {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      mounted = false;
      controller.abort();
      ownedLease?.release();
    };
  }, [assetId, instanceId, invalidate, loader, onStatus]);

  useEffect(() => {
    if (!matches || !clipName) return;
    const clip = matches.clips.find((item) => item.name === clipName);
    if (!clip) return;
    const mixer = new AnimationMixer(matches.root);
    const action = mixer.clipAction(clip);
    action.setLoop(LoopRepeat, reducedMotion ? 1 : Infinity).play();
    if (reducedMotion) {
      mixer.update(0);
      action.paused = true;
    }
    mixerRef.current = mixer;
    if (!reducedMotion) invalidate();
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(matches.root);
      if (mixerRef.current === mixer) mixerRef.current = null;
    };
  }, [clipName, invalidate, matches, reducedMotion]);

  useFrame((_, deltaSeconds) => {
    const mixer = mixerRef.current;
    if (!reducedMotion && mixer) {
      mixer.update(Math.min(deltaSeconds, 0.1));
      invalidate();
    }
  });

  if (!matches) return null;
  return <primitive object={matches.root} position={position} dispose={null} />;
}

function OrbitCamera() {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    const invalidateOnChange = () => invalidate();
    controls.enableDamping = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 12;
    controls.target.set(0, 0.6, 0);
    controls.addEventListener('change', invalidateOnChange);
    controls.update();
    invalidate();
    return () => {
      controls.removeEventListener('change', invalidateOnChange);
      controls.dispose();
    };
  }, [camera, gl, invalidate]);
  return null;
}

function ResourceStats({
  onStats,
}: {
  readonly onStats: (value: { readonly geometries: number; readonly textures: number }) => void;
}) {
  const { gl, invalidate } = useThree();
  const last = useRef(0);
  const pending = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
    },
    [],
  );
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 500 || pending.current !== null) return;
    last.current = now;
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      onStats({ geometries: gl.info.memory.geometries, textures: gl.info.memory.textures });
    });
    invalidate();
  });
  return null;
}

function PreviewApp() {
  const [records, setRecords] = useState<readonly ModelAssetRecord[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [semanticAction, setSemanticAction] = useState<SemanticAction>('idle');
  const [clipOverrides, setClipOverrides] = useState<Readonly<Record<string, string>>>({});
  const [secondaryClip, setSecondaryClip] = useState('');
  const [showSecond, setShowSecond] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [statuses, setStatuses] = useState<Readonly<Record<string, InstanceStatus>>>({});
  const [rendererMemory, setRendererMemory] = useState({ geometries: 0, textures: 0 });
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const intentionalCanvasUnmount = useRef(false);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const contextLossListenerRef = useRef<((event: Event) => void) | null>(null);
  const previewManifestUrl = new URLSearchParams(window.location.search).get('records');
  const loader = useMemo(
    () => (records.length ? createModelAssetLoader(previewLoaderRecords(records)) : null),
    [records],
  );
  const record = records.find((asset) => asset.id === selectedAssetId) ?? null;
  const clipInventory = record?.clipInventory ?? [];
  const semanticClip = record?.clips[semanticAction] ?? '';
  const selectedClip = clipOverrides[`${selectedAssetId}:${semanticAction}`] ?? semanticClip;
  const allClips = clipInventory.map((clip) => clip.name);
  const fallbackSecondaryClip = allClips.find((name) => name !== selectedClip) ?? allClips[0] ?? '';

  useEffect(() => {
    let active = true;
    const loading = previewManifestUrl
      ? readRecordsFromUrl(previewManifestUrl)
      : Promise.resolve(defaultRecords);
    void loading
      .then((nextRecords) => {
        if (!active) return;
        setRecords(nextRecords);
        const first = defaultAsset(nextRecords);
        if (first) {
          setSelectedAssetId(first.id);
          setSecondaryClip(first.clipInventory[0]?.name ?? '');
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [previewManifestUrl]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => () => loader?.dispose(), [loader]);

  useEffect(
    () => () => {
      const renderer = rendererRef.current;
      const listener = contextLossListenerRef.current;
      if (renderer && listener)
        renderer.domElement.removeEventListener('webglcontextlost', listener);
      rendererRef.current = null;
      contextLossListenerRef.current = null;
      if (window.__creatorPreviewProbe) delete window.__creatorPreviewProbe;
    },
    [],
  );

  const onStatus = useCallback((id: string, status: InstanceStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const onCreated = useCallback(
    ({ scene, gl, camera }: { scene: Scene; gl: WebGLRenderer; camera: Camera }) => {
      intentionalCanvasUnmount.current = false;
      const previousRenderer = rendererRef.current;
      const previousListener = contextLossListenerRef.current;
      if (previousRenderer && previousListener)
        previousRenderer.domElement.removeEventListener('webglcontextlost', previousListener);
      const onContextLost = (event: Event) => {
        event.preventDefault();
        if (!intentionalCanvasUnmount.current) setContextLost(true);
      };
      rendererRef.current = gl;
      contextLossListenerRef.current = onContextLost;
      gl.domElement.addEventListener('webglcontextlost', onContextLost);
      window.__creatorPreviewProbe = { scene, renderer: gl, camera };
      gl.domElement.dataset.testid = 'creator-preview-canvas';
    },
    [],
  );
  const reloadCanvas = useCallback(() => {
    intentionalCanvasUnmount.current = true;
    const renderer = rendererRef.current;
    const listener = contextLossListenerRef.current;
    if (renderer && listener) renderer.domElement.removeEventListener('webglcontextlost', listener);
    rendererRef.current = null;
    contextLossListenerRef.current = null;
    setContextLost(false);
    delete window.__creatorPreviewProbe;
    setCanvasRevision((revision) => revision + 1);
  }, []);

  const updateSemanticClip = (clipName: string) => {
    setClipOverrides((current) => ({
      ...current,
      [`${selectedAssetId}:${semanticAction}`]: clipName,
    }));
  };

  const primaryPosition: readonly [number, number, number] = showSecond ? [-0.85, 0, 0] : [0, 0, 0];
  const secondaryPosition: readonly [number, number, number] = [0.85, 0, 0];

  return (
    <main className="creator-preview">
      <header className="creator-preview__header">
        <div>
          <p className="eyebrow">WAYPOINT RPG · LOCAL CREATOR TOOL</p>
          <h1>Asset preview</h1>
          <p>
            Inspect a locally imported model, its rig, source clips, materials, and recorded
            provenance.
          </p>
        </div>
        <div className="preview-disclaimer" role="note" data-testid="preview-disclaimer">
          Preview is a technical check. It does not approve an asset or change its release rights.
        </div>
      </header>

      {loadError && (
        <p role="alert" className="preview-error">
          {loadError}
        </p>
      )}
      {!records.length && !loadError && <p role="status">Loading local asset records…</p>}
      {Object.entries(statuses).some(([, status]) => status.status === 'error') && (
        <div className="preview-error" role="alert" data-testid="preview-load-error">
          {Object.entries(statuses)
            .filter(([, status]) => status.status === 'error')
            .map(([id, status]) => `${id}: ${status.message ?? 'Model load failed'}`)
            .join(' · ')}
        </div>
      )}

      {record && loader && (
        <div className="creator-preview__layout">
          <section className="preview-stage" aria-label="Interactive model preview">
            <Canvas
              key={canvasRevision}
              frameloop="demand"
              camera={{ position: [0, 2.2, 5.2], fov: 42 }}
              onCreated={onCreated}
            >
              <color attach="background" args={['#e8eee8']} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[3, 5, 4]} intensity={2} />
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
                <planeGeometry args={[5, 4]} />
                <meshStandardMaterial color="#a8b9a5" />
              </mesh>
              <OrbitCamera />
              <ResourceStats onStats={setRendererMemory} />
              <Bounds record={record} position={primaryPosition} />
              <PreviewModel
                key={`primary:${record.id}:${canvasRevision}`}
                assetId={record.id}
                instanceId="primary"
                loader={loader}
                clipName={selectedClip || undefined}
                reducedMotion={reducedMotion}
                position={primaryPosition}
                onStatus={onStatus}
              />
              {showSecond && (
                <>
                  <Bounds record={record} position={secondaryPosition} />
                  <PreviewModel
                    key={`secondary:${record.id}:${canvasRevision}`}
                    assetId={record.id}
                    instanceId="secondary"
                    loader={loader}
                    clipName={secondaryClip || undefined}
                    reducedMotion={reducedMotion}
                    position={secondaryPosition}
                    onStatus={onStatus}
                  />
                </>
              )}
            </Canvas>
            <div className="preview-stage__toolbar">
              <button type="button" onClick={reloadCanvas} data-testid="preview-reload">
                Reload preview
              </button>
              <span>Drag to orbit · wheel or pinch to zoom</span>
            </div>
            {contextLost && (
              <div className="preview-error" role="alert" data-testid="preview-context-lost">
                <span>
                  The WebGL context stopped. Reload the preview to release and recreate its
                  resources.
                </span>
                <button type="button" onClick={reloadCanvas} data-testid="preview-context-recover">
                  Recover preview
                </button>
              </div>
            )}
          </section>

          <aside className="preview-panel" aria-label="Asset inspection controls and details">
            <label>
              Asset
              <select
                value={record.id}
                onChange={(event) => {
                  const nextId = event.currentTarget.value;
                  const nextRecord = records.find((asset) => asset.id === nextId);
                  setSelectedAssetId(nextId);
                  const nextIdle = nextRecord?.clips.idle;
                  setSecondaryClip(
                    nextRecord?.clipInventory.find((clip) => clip.name !== nextIdle)?.name ??
                      nextIdle ??
                      nextRecord?.clipInventory[0]?.name ??
                      '',
                  );
                }}
                data-testid="preview-asset-select"
              >
                {records.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="preview-control-grid">
              <label>
                Semantic action
                <select
                  value={semanticAction}
                  onChange={(event) =>
                    setSemanticAction(event.currentTarget.value as SemanticAction)
                  }
                  data-testid="preview-semantic-select"
                >
                  {SEMANTIC_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {ACTION_LABELS[action]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mapped source clip
                <select
                  value={selectedClip}
                  onChange={(event) => updateSemanticClip(event.currentTarget.value)}
                  disabled={allClips.length === 0}
                  data-testid="preview-semantic-clip-select"
                >
                  {allClips.map((clip) => (
                    <option key={clip} value={clip}>
                      {clip}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {showSecond && (
              <label>
                Second instance clip
                <select
                  value={secondaryClip || fallbackSecondaryClip}
                  onChange={(event) => setSecondaryClip(event.currentTarget.value)}
                  disabled={allClips.length === 0}
                  data-testid="preview-secondary-clip-select"
                >
                  {allClips.map((clip) => (
                    <option key={clip} value={clip}>
                      {clip}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="preview-checks">
              <label className="preview-checkbox">
                <input
                  type="checkbox"
                  checked={showSecond}
                  onChange={(event) => setShowSecond(event.currentTarget.checked)}
                  data-testid="preview-two-instances"
                />
                Show an independent second instance
              </label>
              <label className="preview-checkbox">
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(event) => setReducedMotion(event.currentTarget.checked)}
                  data-testid="preview-reduced-motion"
                />
                Reduced motion
              </label>
            </div>
            <p className="preview-mapping-note">
              The semantic clip mapping is a preview-only override; it is not saved to the catalog.
            </p>

            <section className="preview-details" aria-labelledby="preview-details-title">
              <h2 id="preview-details-title">Technical record</h2>
              <dl>
                <dt>Load status</dt>
                <dd
                  data-testid="preview-primary-status"
                  data-status={statuses.primary?.status ?? 'loading'}
                >
                  {loadStatusText(statuses.primary)}
                </dd>
                <dt>Primary mesh count</dt>
                <dd data-testid="preview-primary-count">{statuses.primary?.meshes ?? 0}</dd>
                {showSecond && (
                  <>
                    <dt>Second instance</dt>
                    <dd
                      data-testid="preview-secondary-status"
                      data-status={statuses.secondary?.status ?? 'loading'}
                    >
                      {loadStatusText(statuses.secondary)}
                    </dd>
                    <dt>Second mesh count</dt>
                    <dd data-testid="preview-secondary-count">{statuses.secondary?.meshes ?? 0}</dd>
                  </>
                )}
                <dt>Primary source clip</dt>
                <dd data-testid="preview-primary-clip">{selectedClip || 'Static model'}</dd>
                {showSecond && (
                  <>
                    <dt>Second source clip</dt>
                    <dd data-testid="preview-secondary-clip">
                      {secondaryClip || fallbackSecondaryClip || 'Static model'}
                    </dd>
                  </>
                )}
                <dt>Runtime format</dt>
                <dd>{record.runtimeFormat.toUpperCase()}</dd>
                <dt>Approval in source record</dt>
                <dd data-testid="preview-approval">
                  {record.rights.approved ? 'Approved' : 'Not approved'}
                </dd>
                <dt>Provenance</dt>
                <dd>{record.sourceOrigin}</dd>
                <dt>License</dt>
                <dd>
                  {record.rights.licenseId} · {record.rights.attribution}
                </dd>
                <dt>Runtime SHA-256</dt>
                <dd className="hash">{record.outputSha256}</dd>
                <dt>Bounds (m)</dt>
                <dd>
                  {record.bounds.min.join(', ')} → {record.bounds.max.join(', ')}
                </dd>
                <dt>Geometry</dt>
                <dd>
                  {record.metrics.triangles.toLocaleString()} triangles ·{' '}
                  {record.metrics.primitiveCount} primitives · {record.metrics.jointCount} joints ·{' '}
                  {record.metrics.morphTargetNames.length} morph targets
                </dd>
                <dt>Materials and textures</dt>
                <dd>
                  {record.materialNames.join(', ') || 'No named materials'} ·{' '}
                  {record.metrics.textureCount} textures · {record.metrics.maxTextureDimension}px
                  max · {(record.metrics.textureBytes / 1024).toFixed(1)} KiB
                </dd>
                <dt>Source animation clips</dt>
                <dd>
                  {record.clipInventory.length
                    ? record.clipInventory
                        .map((clip) => `${clip.name} (${clip.durationSeconds.toFixed(2)}s)`)
                        .join(', ')
                    : 'No animation clips'}
                </dd>
                <dt>Observed renderer resources</dt>
                <dd data-testid="preview-renderer-memory">
                  {rendererMemory.geometries} geometries · {rendererMemory.textures} textures
                </dd>
                <dt>Estimated decoded memory</dt>
                <dd>{(record.metrics.estimatedDecodedBytes / 1024).toFixed(1)} KiB</dd>
                <dt>Import warnings</dt>
                <dd>{record.warnings.length ? record.warnings.join('; ') : 'None recorded'}</dd>
              </dl>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PreviewApp />);
