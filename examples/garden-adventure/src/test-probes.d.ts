import type { SemanticAction } from 'waypoint-rpg-three';
import type { GardenEndingId } from './presentation/ending-cinematic.js';
import type { GardenMapId } from './world/world.js';

declare global {
  interface Window {
    __gardenBundledModels?: Record<
      string,
      {
        readonly assetId: string;
        readonly status: 'loading' | 'ready' | 'error';
        readonly action?: SemanticAction;
        readonly failure?: string;
        readonly render?: {
          readonly mapId: GardenMapId;
          readonly source: 'asset' | 'fallback';
          readonly frame: number;
          readonly drawCalls: number;
          readonly vertexCount: number;
          readonly boneCount: number;
          readonly semanticAction: SemanticAction | null;
        };
      }
    >;
    __gardenEndingCinematicProbe?: {
      readonly endingId: GardenEndingId;
      readonly requestId: string;
      readonly status: 'playing' | 'cancelled' | 'completed';
      readonly cameraPosition: readonly [number, number, number];
      readonly initialCameraPosition: readonly [number, number, number];
    };
    __gardenSaveWrites?: Array<{
      readonly mapId: string | null;
      readonly anchorId: string | null;
      readonly playerAtAnchor: boolean;
    }>;
  }
}

export {};
