export interface SceneProbe {
  frameCount: number;
  disposedScenes: number;
  runtimeSubscriptions: number;
  cameraKind: 'perspective' | 'orthographic' | 'unknown';
  cameraIsOrthographic: boolean;
  cameraPosition: readonly number[];
  rendererMemory: { readonly geometries: number; readonly textures: number };
  lampLit: boolean;
  lanternAccent: boolean;
  guardianAction: string;
  activeAudioLeases: number;
  narrativeRevision: number;
}

declare global {
  interface Window {
    __sceneProbe?: SceneProbe;
  }
}

export function sceneProbe(): SceneProbe | null {
  if (typeof window === 'undefined') return null;
  return (window.__sceneProbe ??= {
    frameCount: 0,
    disposedScenes: 0,
    runtimeSubscriptions: 0,
    cameraKind: 'unknown',
    cameraIsOrthographic: false,
    cameraPosition: [],
    rendererMemory: { geometries: 0, textures: 0 },
    lampLit: false,
    lanternAccent: false,
    guardianAction: 'idle',
    activeAudioLeases: 0,
    narrativeRevision: 0,
  });
}
