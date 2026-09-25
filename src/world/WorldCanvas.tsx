import { useEffect, useRef, useState, type Ref } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type {
  AnchorId,
  AvatarId,
  QualityTier,
  QuestId,
  QuestStatus,
} from '../domain/game/types.ts';
import { maxPixelRatioFor } from '../services/device/capabilities.ts';
import { Hub, type HubHandle } from './Hub.tsx';
import { CUBIC_MODELS } from './models/cubicModels.ts';
import { ModelContext } from './models/modelProvider.ts';

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

/** Redraws when React state that the scene depends on changes. */
function InvalidateOnChange({ token }: { readonly token: unknown }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [invalidate, token]);
  return null;
}

export interface WorldCanvasProps {
  readonly avatarId: AvatarId;
  readonly questStatuses: Record<QuestId, QuestStatus>;
  readonly completedCount: number;
  readonly interactive: boolean;
  readonly qualityTier: QualityTier;
  readonly onArrive: (anchor: AnchorId) => void;
  readonly onContextLost: () => void;
  readonly handleRef?: Ref<HubHandle>;
}

export function WorldCanvas({
  avatarId,
  questStatuses,
  completedCount,
  interactive,
  qualityTier,
  onArrive,
  onContextLost,
  handleRef,
}: WorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(70);

  // Locked isometric framing: no orbit controls, no camera input of any kind.
  useEffect(() => {
    const onResize = () => setZoom(Math.max(46, Math.min(96, window.innerWidth / 14)));
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
            onContextLost();
          });
        }}
      >
        <VisibilityPause />
        <InvalidateOnChange
          token={`${avatarId}:${completedCount}:${String(interactive)}:${zoom}`}
        />
        <ModelContext.Provider value={CUBIC_MODELS}>
          <Hub
            avatarId={avatarId}
            questStatuses={questStatuses}
            completedCount={completedCount}
            interactive={interactive}
            onArrive={onArrive}
            handleRef={handleRef}
          />
        </ModelContext.Provider>
      </Canvas>
    </div>
  );
}
