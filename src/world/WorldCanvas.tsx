import { useEffect, useRef, useState, type Ref, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type {
  AnchorId,
  AvatarId,
  HeadwearId,
  QualityTier,
  QuestId,
  QuestStatus,
} from '../domain/game/types.ts';
import { maxPixelRatioFor } from '../services/device/capabilities.ts';
import { Hub, type HubHandle } from './Hub.tsx';
import { CUBIC_MODELS } from './models/cubicModels.ts';
import { ModelContext, detailLevelFor } from './models/modelProvider.ts';
import { skyDomeResources } from './models/shared.ts';
import { noRaycast } from './models/raycast.ts';
import { ANCHORS } from './navigation/graph.ts';
import { CRITTER_BOUNDS } from './critters.ts';

/**
 * Screen-space footprint of the whole hub. The camera looks along (1,1,1), so a
 * ground anchor projects to |x−z|/√2 horizontally and (x+z)/√6 vertically, plus
 * ~0.82 per unit of model height. The margins cover hotspot rings and the
 * NPC/landmark offsets so every landmark stays inside the viewport — without
 * this, landscape phones (wide but short) cropped the top and bottom of the
 * neighbourhood.
 */
const FIT = (() => {
  // The envelope covers the ground anchors AND the ambient airspace
  // (CRITTER_BOUNDS) so a soaring eagle is never clipped by the frustum:
  // horizontal reach widens the side term, maxY widens the vertical term
  // (≈0.82 screen units per world height unit, per the comment above).
  const side =
    Math.max(
      Math.max(...ANCHORS.map((anchor) => Math.abs(anchor.x - anchor.z) / Math.SQRT2)),
      CRITTER_BOUNDS.maxHorizontalRadius,
    ) + 1.7;
  const depth =
    Math.max(...ANCHORS.map((anchor) => Math.abs(anchor.x + anchor.z) / Math.sqrt(6))) +
    2.9 +
    CRITTER_BOUNDS.maxY * 0.82;
  return { width: side * 2, height: depth * 2 };
})();

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

/** Redraws when React state that the scene depends on changes. */
function InvalidateOnChange({ token }: { readonly token: unknown }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [invalidate, token]);
  return null;
}

export interface WorldCanvasProps {
  readonly avatarId: AvatarId;
  readonly headwear: HeadwearId;
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly completedCount: number;
  readonly interactive: boolean;
  readonly qualityTier: QualityTier;
  readonly suggestedQuestId: QuestId | null;
  readonly onArrive: (anchor: AnchorId) => void;
  readonly onContextLost: () => void;
  readonly handleRef?: Ref<HubHandle>;
}

export function WorldCanvas({
  avatarId,
  headwear,
  questStatuses,
  completedCount,
  interactive,
  qualityTier,
  suggestedQuestId,
  onArrive,
  onContextLost,
  handleRef,
}: WorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneAlive = useRef(false);
  const [zoom, setZoom] = useState(70);
  // The quality tier is the only quality system; the world only derives how
  // much decoration it draws from it, never a different render pipeline.
  const detailLevel = detailLevelFor(qualityTier);

  // Locked isometric framing: no orbit controls, no camera input of any kind.
  // Zoom fits the whole neighbourhood, limited by the tighter viewport axis.
  useEffect(() => {
    const onResize = () =>
      setZoom(
        Math.min(
          96,
          Math.max(20, Math.min(window.innerWidth / FIT.width, window.innerHeight / FIT.height)),
        ),
      );
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
          gl.setClearColor('#cfe8ff');
          camera.lookAt(0, 0, 0);
          if (import.meta.env.DEV) {
            // Perf-gate hook for scripts/measure-world.mjs; dev server only.
            const w = window as unknown as Record<string, unknown>;
            w.__worldRenderer = gl;
            w.__worldScene = scene;
            w.__worldCamera = camera;
            w.__worldCanvasId = canvasInstanceCounter += 1;
          }
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            if (sceneAlive.current) onContextLost();
          });
        }}
      >
        <CanvasLiveness flagRef={sceneAlive} />
        <VisibilityPause />
        {/* Atmosphere: distance haze toward the horizon + gradient sky dome.
            Both are scene-level attachments so they must live at Canvas root. */}
        <fog attach="fog" args={['#e3ede9', 26, 68]} />
        <SkyDome />
        <InvalidateOnChange
          token={`${avatarId}:${headwear}:${completedCount}:${String(interactive)}:${zoom}:${qualityTier}`}
        />
        <ModelContext.Provider value={CUBIC_MODELS}>
          <Hub
            avatarId={avatarId}
            headwear={headwear}
            questStatuses={questStatuses}
            completedCount={completedCount}
            interactive={interactive}
            detailLevel={detailLevel}
            onArrive={onArrive}
            handleRef={handleRef}
            suggestedQuestId={suggestedQuestId}
          />
        </ModelContext.Provider>
      </Canvas>
    </div>
  );
}
