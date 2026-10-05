import { useEffect, useRef, type Ref, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  AnchorId,
  AvatarId,
  DiscoveryId,
  HeadwearId,
  MapId,
  QualityTier,
  QuestId,
  QuestStatus,
} from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import { maxPixelRatioFor } from '../services/device/capabilities.ts';
import { Hub, type HubHandle } from './Hub.tsx';
import { CUBIC_MODELS } from './models/cubicModels.ts';
import { ModelContext, detailLevelFor } from './models/modelProvider.ts';
import { skyDomeResources } from './models/shared.ts';
import { noRaycast } from './models/raycast.ts';
import { getMap } from './maps.ts';
import { CaveWorld } from './CaveWorld.tsx';
import { CameraRig } from './CameraRig.tsx';
import { zoomForMap } from './camera.ts';
import type { NpcAttention } from './sceneBits.tsx';
import type { WorldDiag } from './diagnostics.ts';

/** Dev-only instance counter: QA asserts orientation changes never remount the Canvas. */
let canvasInstanceCounter = 0;

/** Pauses the render loop while the tab is hidden and redraws once on return. */
function VisibilityPause() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [invalidate]);
  return null;
}

/**
 * Tracks whether the scene tree is alive. R3F calls renderer.forceContextLoss()
 * while unmounting <Canvas>, which fires the same 'webglcontextlost' event as a
 * genuine GPU loss; the flag lets that handler skip teardown-induced loss so
 * pausing or leaving for the parent area does not strand the
 * hub on the DOM fallback. Child effects unmount before the renderer is
 * disposed, so the flag is already false by then.
 */
function CanvasLiveness({ flagRef }: { readonly flagRef: RefObject<boolean> }) {
  useEffect(() => {
    flagRef.current = true;
    return () => {
      flagRef.current = false;
    };
  }, [flagRef]);
  return null;
}

/** Vertex-colored sky backdrop; one shared geometry + basic material, ignores fog. */
function SkyDome() {
  const { geometry, material } = skyDomeResources();
  return (
    <mesh
      geometry={geometry}
      material={material}
      raycast={noRaycast}
      frustumCulled={false}
      renderOrder={-1}
    />
  );
}

/** Applies the map's clear colour (mount + map change) and repaints. */
function EnvironmentClear({ color }: { readonly color: string }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    gl.setClearColor(color);
    invalidate();
  }, [gl, color, invalidate]);
  return null;
}

/** Redraws when React state that the scene depends on changes. */
function InvalidateOnChange({ token }: { readonly token: unknown }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [invalidate, token]);
  return null;
}

/**
 * `?diagnostics=1` probe: publishes the live renderer/scene plus a rendered-
 * frame counter on `window.__worldDiag` so the parent diagnostics panel can
 * read FPS and `gl.info` on demand. Under `frameloop="demand"` `useFrame`
 * fires only for frames actually drawn — the counter IS the fps base, it
 * adds no work of its own.
 */
function DiagnosticsProbe({ mapId }: { readonly mapId: MapId }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useFrame(() => {
    const diag = window.__worldDiag;
    if (diag) diag.frames += 1;
  });
  useEffect(() => {
    window.__worldDiag = { renderer: gl, scene, mapId, frames: 0 } satisfies WorldDiag;
    return () => {
      delete window.__worldDiag;
    };
  }, [gl, scene, mapId]);
  return null;
}

export interface WorldCanvasProps {
  readonly avatarId: AvatarId;
  readonly headwear: HeadwearId;
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly completedCount: number;
  readonly interactive: boolean;
  readonly qualityTier: QualityTier;
  /** The world data this canvas renders — static for the game, a document
      source under the World Builder. */
  readonly world: WorldSource;
  /** The map currently mounted — the other map's scene does not exist. */
  readonly mapId: MapId;
  /** Anchor the avatar stands at on this map (spawn/restored position). */
  readonly startAnchorId: AnchorId;
  readonly discoveries: readonly DiscoveryId[];
  readonly onArrive: (anchor: AnchorId) => void;
  /** Tap a mounted NPC figure → talk to them where they currently stand. */
  readonly onNpcTap?: (npcId: string) => void;
  /** Coarse world clock driving NPC routines (ticks once per arrival). */
  readonly worldTime?: number;
  /** Who noticed the latest arrival — replays a one-shot cue per nonce. */
  readonly attention?: NpcAttention | null;
  /** Arrival identity — increments once per avatar arrival; arrival-driven
      presentation liveliness keys off it. */
  readonly arrivalNonce?: number;
  /** Session-only find memory — owned by the caller (App) so it survives
      this scene's remounts on map transitions. Never persisted. */
  readonly revealedFinds?: ReadonlySet<string>;
  readonly onRevealFind?: (findId: string) => void;
  readonly onContextLost: () => void;
  readonly handleRef?: Ref<HubHandle>;
  /** Extra scene content (World Builder overlays in edit mode). */
  readonly overlays?: React.ReactNode;
  /** `?diagnostics=1`: publish the live world handle for the parent panel. */
  readonly diagnostics?: boolean;
}

export function WorldCanvas({
  avatarId,
  headwear,
  questStatuses,
  completedCount,
  interactive,
  qualityTier,
  world,
  mapId,
  startAnchorId,
  discoveries,
  onArrive,
  onNpcTap,
  worldTime,
  attention,
  arrivalNonce,
  revealedFinds,
  onRevealFind,
  onContextLost,
  handleRef,
  overlays,
  diagnostics = false,
}: WorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneAlive = useRef(false);
  const zoom = zoomForMap(world, mapId);
  // The quality tier is the only quality system; the world only derives how
  // much decoration it draws from it, never a different render pipeline.
  const detailLevel = detailLevelFor(qualityTier);
  const map = getMap(world, mapId);
  const env = map.environment;

  // E2E/QA probe: which map is mounted (same Canvas — map switches don't
  // remount it, only the scene subtree does).
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (import.meta.env.DEV || w['__WORLD_PROBE']) w['__worldMapId'] = mapId;
  }, [mapId]);

  return (
    <div className="world" ref={containerRef} data-testid="world-canvas">
      <Canvas
        frameloop="demand"
        orthographic
        dpr={[1, maxPixelRatioFor(qualityTier)]}
        shadows={false}
        camera={{ position: [10, 10, 10], zoom, near: -100, far: 200 }}
        gl={{ antialias: qualityTier !== 'low', powerPreference: 'low-power', alpha: false }}
        onCreated={({ gl, camera, scene }) => {
          gl.setClearColor(env.clearColor);
          camera.lookAt(0, 0, 0);
          const probeFlag = (window as unknown as Record<string, unknown>)['__WORLD_PROBE'];
          if (import.meta.env.DEV || probeFlag) {
            // Perf/QA hooks for scripts/measure-world.mjs and e2e: enabled in
            // dev, and in e2e when the page sets __WORLD_PROBE before load.
            const w = window as unknown as Record<string, unknown>;
            w.__worldRenderer = gl;
            w.__worldScene = scene;
            w.__worldCamera = camera;
            w.__worldCanvasId = canvasInstanceCounter += 1;
            w.__worldToScreen = (wx: number, wz: number, wy = 0) => {
              const rect = gl.domElement.getBoundingClientRect();
              const point = new THREE.Vector3(wx, wy, wz).project(camera);
              return {
                x: rect.left + ((point.x + 1) / 2) * rect.width,
                y: rect.top + ((1 - point.y) / 2) * rect.height,
              };
            };
          }
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            if (sceneAlive.current) onContextLost();
          });
        }}
      >
        <CanvasLiveness flagRef={sceneAlive} />
        <VisibilityPause />
        {diagnostics ? <DiagnosticsProbe mapId={mapId} /> : null}
        {/* Follow-camera: tracks the avatar, clamped to this map's bounds.
            `key` remounts it per map so a transition snaps to the new
            spawn instead of easing from stale cross-map coordinates. */}
        <CameraRig key={mapId} world={world} mapId={mapId} />
        {/* Atmosphere comes from the map's EnvironmentDefinition — a cave
            swaps the sky+haze for a closed dark look without new code. */}
        {env.fog ? <fog attach="fog" args={[env.fog.color, env.fog.near, env.fog.far]} /> : null}
        {env.skyDome ? <SkyDome /> : null}
        <EnvironmentClear color={env.clearColor} />
        <InvalidateOnChange
          token={`${avatarId}:${headwear}:${completedCount}:${String(interactive)}:${zoom}:${qualityTier}:${mapId}`}
        />
        <ModelContext.Provider value={CUBIC_MODELS}>
          {/* Only the current map's scene mounts — the other side carries
              zero mounted content and zero callbacks. `key` remounts the
              scene so the walker restarts at the map's spawn anchor. */}
          {mapId === 'map-cave' ? (
            <CaveWorld
              key="map-cave"
              world={world}
              avatarId={avatarId}
              headwear={headwear}
              questStatuses={questStatuses}
              interactive={interactive}
              detailLevel={detailLevel}
              startAnchorId={startAnchorId}
              environment={env}
              onArrive={onArrive}
              onNpcTap={onNpcTap}
              attention={attention}
              handleRef={handleRef}
            />
          ) : (
            <Hub
              key="map-town"
              world={world}
              avatarId={avatarId}
              headwear={headwear}
              questStatuses={questStatuses}
              completedCount={completedCount}
              interactive={interactive}
              detailLevel={detailLevel}
              startAnchorId={startAnchorId}
              discoveries={discoveries}
              onArrive={onArrive}
              onNpcTap={onNpcTap}
              worldTime={worldTime}
              attention={attention}
              arrivalNonce={arrivalNonce}
              revealedFinds={revealedFinds}
              onRevealFind={onRevealFind}
              handleRef={handleRef}
            />
          )}
        </ModelContext.Provider>
        {overlays}
      </Canvas>
    </div>
  );
}
