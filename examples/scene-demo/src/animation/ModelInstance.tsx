import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { CharacterAnimationController } from './character-animation.js';
import { createCharacterAnimationController } from './character-animation.js';
import type { SemanticAction } from './contracts.js';
import type { ModelAssetLoader, ModelLease } from './model-loader.js';
import type { LoadedModelLease } from './model-instance-lease.js';
import { modelLeaseForRequest } from './model-instance-lease.js';

export type ModelLoadStatus =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly assetId: string;
      readonly loadDurationMs: number;
      readonly meshes: number;
      readonly skinnedMeshes: number;
      readonly clips: readonly string[];
    }
  | { readonly status: 'error'; readonly message: string };

interface ModelInstanceProps {
  readonly instanceId: string;
  readonly assetId: string;
  readonly loader: ModelAssetLoader;
  readonly position: readonly [number, number, number];
  readonly action: SemanticAction;
  readonly actionRevision: number;
  readonly reducedMotion: boolean;
  readonly onStatus: (instanceId: string, status: ModelLoadStatus) => void;
}

export function ModelInstance({
  instanceId,
  assetId,
  loader,
  position,
  action,
  actionRevision,
  reducedMotion,
  onStatus,
}: ModelInstanceProps) {
  const [loaded, setLoaded] = useState<LoadedModelLease | null>(null);
  const animationRef = useRef<{
    readonly assetId: string;
    readonly instanceId: string;
    readonly loader: ModelAssetLoader;
    readonly controller: CharacterAnimationController;
  } | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const invalidateRef = useRef(invalidate);
  const presentationRef = useRef({ action, reducedMotion });
  const onStatusRef = useRef(onStatus);
  const lease = modelLeaseForRequest(loaded, { assetId, instanceId, loader });

  useEffect(() => {
    invalidateRef.current = invalidate;
  }, [invalidate]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    presentationRef.current = { action, reducedMotion };
    const active = animationRef.current;
    if (active?.assetId === assetId && active.instanceId === instanceId && active.loader === loader)
      active.controller.setAction(action, { reducedMotion });
  }, [action, actionRevision, reducedMotion, assetId, instanceId, loader]);

  useFrame((_, deltaSeconds) => {
    const active = animationRef.current;
    if (active?.assetId === assetId && active.instanceId === instanceId && active.loader === loader)
      active.controller.advance(deltaSeconds);
  });

  useEffect(() => {
    const controller = new AbortController();
    const loadStartedAt = performance.now();
    let mounted = true;
    let ownedLease: ModelLease | null = null;
    let animation: CharacterAnimationController | null = null;
    onStatusRef.current(instanceId, { status: 'loading' });
    void loader
      .load(assetId, controller.signal)
      .then((loaded) => {
        if (!mounted || controller.signal.aborted) {
          loaded.release();
          return;
        }
        ownedLease = loaded;
        loaded.root.name = `phase5:${instanceId}`;
        loaded.root.userData.phase5InstanceId = instanceId;
        animation = createCharacterAnimationController(loaded.root, loaded.clips, loaded.record, {
          invalidate: () => invalidateRef.current(),
        });
        loaded.root.userData.phase5AnimationSnapshot = () => animation?.snapshot() ?? null;
        loaded.root.userData.phase5AnimationControl = {
          setAction: (nextAction: SemanticAction, nextReducedMotion = false) =>
            animation?.setAction(nextAction, { reducedMotion: nextReducedMotion }),
          advance: (deltaSeconds: number) => animation?.advance(deltaSeconds) ?? false,
        };
        animationRef.current = { assetId, instanceId, loader, controller: animation };
        animation.setAction(presentationRef.current.action, {
          reducedMotion: presentationRef.current.reducedMotion,
        });
        setLoaded({ assetId, instanceId, loader, lease: loaded });
        let meshes = 0;
        let skinnedMeshes = 0;
        loaded.root.traverse((object) => {
          if ((object as { isMesh?: boolean }).isMesh) meshes += 1;
          if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinnedMeshes += 1;
        });
        onStatusRef.current(instanceId, {
          status: 'ready',
          assetId: loaded.record.id,
          loadDurationMs: Math.max(0, Math.round(performance.now() - loadStartedAt)),
          meshes,
          skinnedMeshes,
          clips: loaded.clips.map((clip) => clip.name),
        });
      })
      .catch((error: unknown) => {
        if (!mounted || controller.signal.aborted) return;
        onStatusRef.current(instanceId, {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      mounted = false;
      controller.abort();
      if (animationRef.current?.controller === animation) animationRef.current = null;
      if (ownedLease) {
        delete ownedLease.root.userData.phase5AnimationSnapshot;
        delete ownedLease.root.userData.phase5AnimationControl;
      }
      animation?.dispose();
      ownedLease?.release();
    };
  }, [assetId, instanceId, loader]);

  if (!lease) return null;
  return <primitive object={lease.root} position={position} dispose={null} />;
}
