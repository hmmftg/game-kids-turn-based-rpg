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
import { ModelContext } from './models/modelProvider.ts';
import { ANCHORS } from './navigation/graph.ts';

/**
 * Screen-space footprint of the whole hub. The camera looks along (1,1,1), so a
 * ground anchor projects to |x−z|/√2 horizontally and (x+z)/√6 vertically, plus
 * ~0.82 per unit of model height. The margins cover hotspot rings and the
 * NPC/landmark offsets so every landmark stays inside the viewport — without
 * this, landscape phones (wide but short) cropped the top and bottom of the
 * neighbourhood.
 */
const FIT = (() => {
  const side =
    Math.max(...ANCHORS.map((anchor) => Math.abs(anchor.x - anchor.z) / Math.SQRT2)) + 1.7;
  const depth =
    Math.max(...ANCHORS.map((anchor) => Math.abs(anchor.x + anchor.z) / Math.sqrt(6))) + 2.9;
  return { width: side * 2, height: depth * 2 };
})();

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
 * leaving for the parent area or the orientation blocker does not strand the
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
        onCreated={({ gl, camera }) => {
          gl.setClearColor('#cfe8ff');
          camera.lookAt(0, 0, 0);
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            if (sceneAlive.current) onContextLost();
          });
        }}
      >
        <CanvasLiveness flagRef={sceneAlive} />
        <VisibilityPause />
        <InvalidateOnChange
          token={`${avatarId}:${headwear}:${completedCount}:${String(interactive)}:${zoom}`}
        />
        <ModelContext.Provider value={CUBIC_MODELS}>
          <Hub
            avatarId={avatarId}
            headwear={headwear}
            questStatuses={questStatuses}
            completedCount={completedCount}
            interactive={interactive}
            onArrive={onArrive}
            handleRef={handleRef}
            suggestedQuestId={suggestedQuestId}
          />
        </ModelContext.Provider>
      </Canvas>
    </div>
  );
}
