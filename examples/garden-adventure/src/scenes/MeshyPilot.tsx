import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, type BufferGeometry, type Group } from 'three';
import {
  createModelAssetLoader,
  validateModelAssetRecord,
  type ModelAssetLoader,
  type ModelAssetRecord,
  type ModelLease,
  type ModelRuntimePolicy,
} from 'waypoint-rpg-three';
import { fitModelToGround, gardenMeshyModels, type ModelGroundFit } from './mesh-presentation.js';

const ASSET_BASE_URL = '/__meshy/pilot/';
const MANIFEST_URL = `${ASSET_BASE_URL}asset-records.json`;

export const GARDEN_MESHY_RUNTIME_POLICY: Readonly<ModelRuntimePolicy> = Object.freeze({
  maxTrianglesPerAsset: 400_000,
  maxLoadedAssets: 5,
  maxDecodedGeometryBytes: 32 * 1024 * 1024,
  maxSceneTriangles: 1_500_000,
  allowUnapproved: true,
});

export type GardenMeshyAssetId =
  (typeof gardenMeshyModels)[keyof typeof gardenMeshyModels]['assetId'];
export type GardenMeshyAssetKey = keyof typeof gardenMeshyModels;
export type GardenMeshyAssetStatus = 'loading' | 'ready' | 'error' | 'missing';

export interface GardenMeshyAssetProbe {
  readonly status: GardenMeshyAssetStatus;
  readonly sha256?: string;
  readonly triangles?: number;
  readonly meshCount?: number;
  readonly vertexCount?: number;
  readonly drawCalls?: number;
  readonly decodedGeometryBytes?: number;
  readonly loadDurationMs?: number;
  readonly rendererGeometries?: number;
  readonly rendererTextures?: number;
  readonly sceneDrawCalls?: number;
  readonly sceneTriangles?: number;
  readonly rendered?: boolean;
  readonly message?: string;
}

declare global {
  interface Window {
    __gardenMeshyAssets?: Partial<Record<GardenMeshyAssetId, GardenMeshyAssetProbe>>;
  }
}

interface PilotContext {
  readonly requested: boolean;
  readonly loader: ModelAssetLoader | null;
  readonly recordIds: ReadonlySet<string>;
}

interface LoadedInstance {
  readonly assetId: GardenMeshyAssetId;
  readonly fit: ModelGroundFit;
  readonly loader: ModelAssetLoader;
  readonly lease: ModelLease;
}

const DISABLED_PILOT_CONTEXT: PilotContext = Object.freeze({
  requested: false,
  loader: null,
  recordIds: new Set<string>(),
});

const GardenMeshyPilotContext = createContext<PilotContext>({
  requested: false,
  loader: null,
  recordIds: new Set(),
});

interface GardenModelMetrics {
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly triangles: number;
  readonly decodedGeometryBytes: number;
}

function inspectLoadedModel(lease: ModelLease): GardenModelMetrics {
  const geometries = new Set<BufferGeometry>();
  let meshCount = 0;
  let vertexCount = 0;
  let triangles = 0;
  let decodedGeometryBytes = 0;

  lease.root.traverse((object) => {
    if (!('isMesh' in object) || object.isMesh !== true) return;
    const mesh = object as typeof object & {
      readonly geometry: BufferGeometry;
      readonly material: readonly unknown[] | unknown;
    };
    meshCount += 1;
    if (!geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry);
      for (const attribute of Object.values(mesh.geometry.attributes))
        decodedGeometryBytes += attribute.array.byteLength;
      for (const attributes of Object.values(mesh.geometry.morphAttributes)) {
        if (!attributes) continue;
        for (const attribute of attributes) decodedGeometryBytes += attribute.array.byteLength;
      }
      if (mesh.geometry.index) decodedGeometryBytes += mesh.geometry.index.array.byteLength;
    }

    const positions = mesh.geometry.getAttribute('position');
    if (!positions) return;
    vertexCount += positions.count;
    triangles += (mesh.geometry.index?.count ?? positions.count) / 3;
  });

  return { meshCount, vertexCount, triangles, decodedGeometryBytes };
}

export function isGardenMeshyPilotRequested(): boolean {
  return new URLSearchParams(window.location.search).get('assets') === 'meshy';
}

function reportAssetStatus(assetId: GardenMeshyAssetId, probe: GardenMeshyAssetProbe): void {
  window.__gardenMeshyAssets = {
    ...window.__gardenMeshyAssets,
    [assetId]: probe,
  };
}

function requestedAssetIds(): readonly GardenMeshyAssetId[] {
  return Object.values(gardenMeshyModels).map((model) => model.assetId);
}

function readAssetRecords(value: unknown): readonly ModelAssetRecord[] {
  if (!Array.isArray(value)) throw new Error('The local model manifest must be an array.');

  const allowedIds = new Set<string>(requestedAssetIds());
  const byId = new Map<string, ModelAssetRecord>();
  const invalidIds = new Set<string>();
  for (const candidate of value) {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('id' in candidate) ||
      typeof candidate.id !== 'string' ||
      !allowedIds.has(candidate.id)
    )
      continue;
    if (byId.has(candidate.id)) {
      byId.delete(candidate.id);
      invalidIds.add(candidate.id);
      continue;
    }
    if (!invalidIds.has(candidate.id)) byId.set(candidate.id, candidate as ModelAssetRecord);
  }

  return [...byId.values()].filter(
    (record) =>
      validateModelAssetRecord(record, GARDEN_MESHY_RUNTIME_POLICY).length === 0 &&
      record.runtimePath === `models/${record.id}.glb`,
  );
}

export function GardenMeshyPilotProvider({ children }: { readonly children: ReactNode }) {
  const requested = isGardenMeshyPilotRequested();
  const [context, setContext] = useState<PilotContext>(() => ({
    requested,
    loader: null,
    recordIds: new Set(),
  }));

  useEffect(() => {
    if (!requested) {
      window.__gardenMeshyAssets = {};
      return;
    }

    const controller = new AbortController();
    let ownedLoader: ModelAssetLoader | null = null;
    for (const assetId of requestedAssetIds()) reportAssetStatus(assetId, { status: 'loading' });

    void (async () => {
      const response = await globalThis.fetch(MANIFEST_URL, {
        credentials: 'same-origin',
        mode: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`The local model server returned ${response.status}.`);
      if (response.headers.get('x-waypoint-meshy-pilot') !== 'enabled')
        throw new Error('The local pilot server must be explicitly enabled.');

      const records = readAssetRecords(await response.json());
      const loader = createModelAssetLoader(records, {
        baseUrl: () => new URL(ASSET_BASE_URL, window.location.origin).href,
        policy: GARDEN_MESHY_RUNTIME_POLICY,
      });
      ownedLoader = loader;
      if (controller.signal.aborted) {
        loader.dispose();
        return;
      }

      const recordIds = new Set(records.map((record) => record.id));
      for (const assetId of requestedAssetIds()) {
        if (!recordIds.has(assetId))
          reportAssetStatus(assetId, {
            status: 'missing',
            message: 'The pilot manifest does not include this model.',
          });
      }
      setContext({ requested: true, loader, recordIds });
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      for (const assetId of requestedAssetIds())
        reportAssetStatus(assetId, { status: 'error', message });
    });

    return () => {
      controller.abort();
      ownedLoader?.dispose();
    };
  }, [requested]);

  return (
    <GardenMeshyPilotContext.Provider value={requested ? context : DISABLED_PILOT_CONTEXT}>
      {children}
    </GardenMeshyPilotContext.Provider>
  );
}

export function MeshyModelVisual({
  modelKey,
  children,
}: {
  readonly modelKey: GardenMeshyAssetKey;
  readonly children: ReactNode;
}) {
  const { requested, loader, recordIds } = useContext(GardenMeshyPilotContext);
  const { invalidate } = useThree();
  const wrapper = useRef<Group>(null);
  const model = gardenMeshyModels[modelKey];
  const assetId = model.assetId;
  const [loadedInstance, setLoadedInstance] = useState<LoadedInstance | null>(null);
  const lease =
    loadedInstance?.assetId === assetId && loadedInstance.loader === loader
      ? loadedInstance.lease
      : null;
  const modelFit = lease ? (loadedInstance?.fit ?? null) : null;
  const reportedRendered = useRef(false);
  const loadDurationMs = useRef<number | undefined>(undefined);
  const modelMetrics = useMemo(() => (lease ? inspectLoadedModel(lease) : null), [lease]);

  useEffect(() => {
    reportedRendered.current = false;
  }, [lease]);

  useEffect(() => {
    if (!requested) return;
    if (!loader || !recordIds.has(assetId)) {
      if (loader)
        reportAssetStatus(assetId, {
          status: 'missing',
          message: 'The pilot model is unavailable.',
        });
      return;
    }

    const controller = new AbortController();
    let activeLease: ModelLease | null = null;
    reportAssetStatus(assetId, { status: 'loading' });
    const loadStartedAt = performance.now();
    loadDurationMs.current = undefined;
    void loader
      .load(assetId, controller.signal, {
        materialOverride: { color: model.color, roughness: 0.78, metalness: 0.08 },
      })
      .then((loaded) => {
        if (controller.signal.aborted) {
          loaded.release();
          return;
        }
        loaded.root.updateWorldMatrix(true, true);
        const box = new Box3().setFromObject(loaded.root);
        const fit = fitModelToGround(
          {
            min: [box.min.x, box.min.y, box.min.z],
            max: [box.max.x, box.max.y, box.max.z],
          },
          model.targetHeight,
        );
        if (!fit) {
          reportAssetStatus(assetId, {
            status: 'error',
            message: 'The model has no usable vertical bounds.',
          });
          loaded.release();
          return;
        }
        activeLease = loaded;
        loadDurationMs.current = performance.now() - loadStartedAt;
        setLoadedInstance({ assetId, fit, loader, lease: loaded });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        reportAssetStatus(assetId, {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      controller.abort();
      activeLease?.release();
    };
  }, [assetId, loader, model.color, model.targetHeight, recordIds, requested]);

  useLayoutEffect(() => {
    if (!lease || !wrapper.current || !modelFit || !modelMetrics) return;
    wrapper.current.scale.setScalar(modelFit.scale);
    wrapper.current.position.y = modelFit.groundOffset;
    reportAssetStatus(assetId, {
      status: 'loading',
      sha256: lease.record.outputSha256,
      triangles: modelMetrics.triangles,
      meshCount: modelMetrics.meshCount,
      vertexCount: modelMetrics.vertexCount,
      decodedGeometryBytes: modelMetrics.decodedGeometryBytes,
      ...(loadDurationMs.current !== undefined ? { loadDurationMs: loadDurationMs.current } : {}),
      rendered: false,
    });

    let active = true;
    let frameDrawCalls = 0;
    let reportQueued = false;
    let latestRendererInfo: Parameters<Group['onAfterRender']>[0]['info'] | null = null;
    const restoreRenderCallbacks: (() => void)[] = [];
    lease.root.traverse((object) => {
      if (!('isMesh' in object) || object.isMesh !== true) return;
      const original = object.onAfterRender;
      const probe: typeof original = (...args) => {
        original(...args);
        latestRendererInfo = args[0].info;
        frameDrawCalls += 1;
        if (reportQueued || reportedRendered.current) return;
        reportQueued = true;
        queueMicrotask(() => {
          reportQueued = false;
          if (!active || reportedRendered.current || !modelMetrics || !latestRendererInfo) return;
          reportedRendered.current = true;
          const { memory, render } = latestRendererInfo;
          reportAssetStatus(assetId, {
            status: 'ready',
            sha256: lease.record.outputSha256,
            triangles: modelMetrics.triangles,
            meshCount: modelMetrics.meshCount,
            vertexCount: modelMetrics.vertexCount,
            drawCalls: frameDrawCalls,
            decodedGeometryBytes: modelMetrics.decodedGeometryBytes,
            loadDurationMs: loadDurationMs.current ?? 0,
            rendererGeometries: memory.geometries,
            rendererTextures: memory.textures,
            sceneDrawCalls: render.calls,
            sceneTriangles: render.triangles,
            rendered: true,
          });
        });
      };
      object.onAfterRender = probe;
      restoreRenderCallbacks.push(() => {
        if (object.onAfterRender === probe) object.onAfterRender = original;
      });
    });
    invalidate();
    return () => {
      active = false;
      for (const restore of restoreRenderCallbacks) restore();
    };
  }, [assetId, invalidate, lease, modelFit, modelMetrics]);

  return (
    <group name={`garden-meshy-${assetId}`}>
      {!requested || !loader || !recordIds.has(assetId) || !lease || !modelFit ? (
        children
      ) : (
        <group ref={wrapper}>
          <primitive object={lease.root} dispose={null} />
        </group>
      )}
    </group>
  );
}
