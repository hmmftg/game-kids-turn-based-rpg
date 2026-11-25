import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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

function reportModel(
  instanceId: string,
  assetId: string,
  status: 'loading' | 'ready' | 'error',
  action?: SemanticAction,
) {
  if (new URLSearchParams(window.location.search).get('modelprobe') !== '1') return;
  window.__gardenBundledModels = {
    ...window.__gardenBundledModels,
    [instanceId]: { assetId, status, ...(action ? { action } : {}) },
  };
}

export function GardenModelProvider({ children }: { readonly children: ReactNode }) {
  const [loader, setLoader] = useState<ModelAssetLoader | null>(null);

  useEffect(() => {
    const ownedLoader = createModelAssetLoader(gardenModelRecords, {
      baseUrl: () => new URL(import.meta.env.BASE_URL, window.location.href).href,
      policy: GARDEN_MODEL_RUNTIME_POLICY,
    });
    setLoader(ownedLoader);
    return () => ownedLoader.dispose();
  }, []);

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

  useEffect(() => {
    if (!loader || !allowedOnMap) return;
    const request = new AbortController();
    let activeLease: ModelLease | null = null;
    reportModel(instanceId, assetId, 'loading');
    void loader
      .load(assetId, request.signal)
      .then((loaded) => {
        if (request.signal.aborted) {
          loaded.release();
          return;
        }
        activeLease = loaded;
        setLease(loaded);
        reportModel(instanceId, assetId, 'ready');
        invalidate();
      })
      .catch(() => {
        if (request.signal.aborted) return;
        // The game-owned procedural child stays visible when a file is missing
        // or fails integrity, decode, animation, or runtime-budget validation.
        reportModel(instanceId, assetId, 'error');
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
    reportModel(instanceId, assetId, 'ready', action);
    invalidate();
  }, [action, assetId, instanceId, invalidate, lease]);

  useFrame((_state, deltaSeconds) => {
    const controller = animationController.current;
    if (controller?.advance(Math.min(0.05, deltaSeconds))) invalidate();
  });

  return (
    <group>
      <group visible={!lease}>{children}</group>
      {lease ? (
        <group position={modelPosition} scale={modelScale}>
          <primitive object={lease.root} dispose={null} />
        </group>
      ) : null}
    </group>
  );
}
