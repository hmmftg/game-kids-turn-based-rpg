import type { GardenMapId } from '../world/world.js';

export interface GardenScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface GardenWorldPoint {
  readonly x: number;
  readonly z: number;
}

export interface GardenArrivalReport {
  readonly routeId: string;
  readonly targetAnchor: string;
  readonly committedAnchor: string;
  readonly nextIndex: number;
  readonly playerAtTarget: boolean;
  readonly candidateFrameCount: number;
  readonly renderedFrameGap: number;
  readonly frameCount: number;
}

export interface GardenSceneProbe {
  readonly activeMap: GardenMapId;
  readonly activeAnchor: string;
  readonly playthroughId: string;
  readonly sceneGeneration: number;
  readonly cameraKind: 'orthographic' | 'unknown';
  readonly visibleMeshCount: number;
  readonly frameCount: number;
  readonly totalFrameCount: number;
  readonly cleanupCount: number;
  readonly playerPosition: GardenWorldPoint;
  readonly playerAtAnchor: boolean;
  readonly walkRouteId: string | null;
  readonly walkTargetAnchor: string | null;
  readonly playerAtWalkTarget: boolean;
  readonly arrivalReports: readonly GardenArrivalReport[];
  readonly targetPoints: Readonly<Record<string, GardenScreenPoint>>;
  readonly renderedConsequences: readonly ('grown-tree' | 'lit-lantern')[];
}

export interface GardenSceneReadiness {
  readonly mapId: GardenMapId;
  readonly anchorId: string;
  readonly playthroughId: string;
  readonly cameraKind: GardenSceneProbe['cameraKind'];
  readonly frameCount: number;
  readonly visibleMeshCount: number;
  readonly playerAtAnchor: boolean;
}

export interface GardenRendererResourceSnapshot {
  readonly mapId: GardenMapId;
  readonly sceneGeneration: number;
  readonly geometryCount: number;
  readonly textureCount: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly sampledAt: number;
}

export interface GardenRendererResourceProbe {
  sample(): GardenRendererResourceSnapshot;
}

declare global {
  interface Window {
    __gardenProbe?: GardenSceneProbe;
    __gardenRendererResourceProbe?: GardenRendererResourceProbe;
  }
}

export function currentGardenProbe(): GardenSceneProbe | undefined {
  return window.__gardenProbe;
}
