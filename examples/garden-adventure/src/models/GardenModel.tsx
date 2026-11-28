import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, SkinnedMesh } from 'three';
import {
  createCharacterAnimationController,
  createModelAssetLoader,
  type CharacterAnimationController,
  type ModelAssetLoader,
  type ModelLease,
  type SemanticAction,
} from 'waypoint-rpg-three';
import {
  GARDEN_MODEL_BINDINGS,
  GARDEN_MODEL_RUNTIME_POLICY,
  gardenModelRecords,
  type GardenModelInstanceId,
} from './asset-records.js';
import type { GardenMapId } from '../world/world.js';

const GardenModelContext = createContext<ModelAssetLoader | null>(null);
const modelProbeEnabled =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('modelprobe') === '1';

function createGardenModelLoaderStore() {
  let loader: ModelAssetLoader | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  return {
    getSnapshot: () => loader,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    install: (nextLoader: ModelAssetLoader) => {
      loader = nextLoader;
      notify();
    },
    clear: (ownedLoader: ModelAssetLoader) => {
      if (loader !== ownedLoader) return;
      loader = null;
      notify();
    },
  };
}

function reportModel(
  instanceId: GardenModelInstanceId,
  report: NonNullable<Window['__gardenBundledModels']>[string],
) {
  (window.__gardenBundledModels ??= {})[instanceId] = report;
}

export function GardenModelProvider({ children }: { readonly children: ReactNode }) {
  const [loaderStore] = useState(createGardenModelLoaderStore);
  const loader = useSyncExternalStore(
    loaderStore.subscribe,
    loaderStore.getSnapshot,
    loaderStore.getSnapshot,
  );

  useEffect(() => {
    const ownedLoader = createModelAssetLoader(gardenModelRecords, {
      baseUrl: () => new URL(import.meta.env.BASE_URL, window.location.href).href,
      policy: GARDEN_MODEL_RUNTIME_POLICY,
    });
    loaderStore.install(ownedLoader);
    return () => {
      loaderStore.clear(ownedLoader);
      ownedLoader.dispose();
    };
  }, [loaderStore]);

  return <GardenModelContext.Provider value={loader}>{children}</GardenModelContext.Provider>;
}

export function GardenModelVisual({
  instanceId,
  mapId,
  action = 'idle',
  modelPosition = [0, 0, 0],
  modelScale = [1, 1, 1],
  children,
}: {
  readonly instanceId: GardenModelInstanceId;
  readonly mapId: GardenMapId;
  readonly action?: SemanticAction;
  readonly modelPosition?: readonly [number, number, number];
  readonly modelScale?: readonly [number, number, number];
  readonly children: ReactNode;
}) {
  const binding = GARDEN_MODEL_BINDINGS[instanceId];
  const assetId = binding.assetId;
  const allowedOnMap = binding.mapIds.includes(mapId);
  const loader = useContext(GardenModelContext);
  const { invalidate } = useThree();
  const [lease, setLease] = useState<ModelLease | null>(null);
  const animationController = useRef<CharacterAnimationController | null>(null);
  const fallbackGroup = useRef<Group>(null);

  useEffect(() => {
    if (!loader || !allowedOnMap) return;
    const request = new AbortController();
    let activeLease: ModelLease | null = null;
    if (modelProbeEnabled) reportModel(instanceId, { assetId, status: 'loading' });
    void loader
      .load(assetId, request.signal)
      .then((loaded) => {
        if (request.signal.aborted) {
          loaded.release();
          return;
        }
        activeLease = loaded;
        setLease(loaded);
        if (modelProbeEnabled) reportModel(instanceId, { assetId, status: 'ready' });
        invalidate();
      })
      .catch((error: unknown) => {
        if (request.signal.aborted) return;
        // The game-owned procedural child stays visible when a file is missing
        // or fails integrity, decode, animation, or runtime-budget validation.
        if (modelProbeEnabled) {
          reportModel(instanceId, {
            assetId,
            status: 'error',
            failure: error instanceof Error ? error.message : String(error),
          });
        }
        invalidate();
      });

    return () => {
      request.abort();
      activeLease?.release();
      setLease(null);
    };
  }, [allowedOnMap, assetId, instanceId, invalidate, loader]);

  useEffect(() => {
    if (!lease || lease.clips.length === 0) return;
    const controller = createCharacterAnimationController(lease.root, lease.clips, lease.record, {
      invalidate,
    });
    animationController.current = controller;
    return () => {
      if (animationController.current === controller) animationController.current = null;
      controller.dispose();
    };
  }, [invalidate, lease]);

  useEffect(() => {
    const controller = animationController.current;
    if (!lease || !controller) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controller.setAction(action, { reducedMotion });
    if (modelProbeEnabled) reportModel(instanceId, { assetId, status: 'ready', action });
    invalidate();
  }, [action, assetId, instanceId, invalidate, lease]);

  useEffect(() => {
    if (!modelProbeEnabled || !allowedOnMap) return;
    const root = lease?.root ?? fallbackGroup.current;
    if (!root) return;

    const restoreCallbacks: (() => void)[] = [];
    const restore = () => {
      for (const restoreCallback of restoreCallbacks) restoreCallback();
    };
    root.traverse((object) => {
      if (!('isMesh' in object) || object.isMesh !== true) return;

      const originalBefore = object.onBeforeRender;
      const originalAfter = object.onAfterRender;
      let callsBefore = 0;
      const before: typeof originalBefore = (...args) => {
        originalBefore.apply(object, args);
        callsBefore = args[0].info.render.calls;
      };
      const after: typeof originalAfter = (...args) => {
        const [renderer, , , geometry] = args;
        const drawCalls = renderer.info.render.calls - callsBefore;
        originalAfter.apply(object, args);
        if (drawCalls <= 0 || renderer.getRenderTarget() !== null) return;

        const report = window.__gardenBundledModels?.[instanceId];
        if (report?.status !== (lease ? 'ready' : 'error')) return;
        const vertexCount = geometry.getAttribute('position')?.count ?? 0;
        if (vertexCount === 0) return;

        reportModel(instanceId, {
          ...report,
          assetId: lease?.record.id ?? report.assetId,
          render: {
            mapId,
            source: lease ? 'asset' : 'fallback',
            frame: renderer.info.render.frame,
            drawCalls,
            vertexCount,
            boneCount:
              'isSkinnedMesh' in object && object.isSkinnedMesh === true
                ? (object as SkinnedMesh).skeleton.bones.length
                : 0,
            semanticAction: animationController.current?.snapshot().semanticAction ?? null,
          },
        });
        restore();
      };
      object.onBeforeRender = before;
      object.onAfterRender = after;
      restoreCallbacks.push(() => {
        if (object.onBeforeRender === before) object.onBeforeRender = originalBefore;
        if (object.onAfterRender === after) object.onAfterRender = originalAfter;
      });
    });
    invalidate();
    return restore;
  }, [action, allowedOnMap, instanceId, invalidate, lease, mapId]);

  useFrame((_state, deltaSeconds) => {
    const controller = animationController.current;
    if (controller?.advance(Math.min(0.05, deltaSeconds))) invalidate();
  });

  return (
    <group>
      <group ref={modelProbeEnabled ? fallbackGroup : null} visible={!lease}>
        {children}
      </group>
      {lease ? (
        <group position={modelPosition} scale={modelScale}>
          <primitive object={lease.root} dispose={null} />
        </group>
      ) : null}
    </group>
  );
}
