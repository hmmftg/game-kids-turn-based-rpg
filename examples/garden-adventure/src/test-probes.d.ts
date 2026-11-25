import type { SemanticAction } from 'waypoint-rpg-three';
import type { GardenEndingId } from './presentation/ending-cinematic.js';

declare global {
  interface Window {
    __gardenBundledModels?: Record<
      string,
      {
        readonly assetId: string;
        readonly status: 'loading' | 'ready' | 'error';
        readonly action?: SemanticAction;
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
