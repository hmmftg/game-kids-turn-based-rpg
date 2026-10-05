import type { Scene, WebGLRenderer } from 'three';
import type { MapId } from '../domain/game/types.ts';

/**
 * Live world handle published by WorldCanvas while `?diagnostics=1`.
 * Read-only: the diagnostics panel polls it for FPS/draw calls/scene counts;
 * nothing here drives rendering or gameplay. The handle is deleted when the
 * canvas unmounts, so a stale read always shows the honest "no live world".
 */
export interface WorldDiag {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  mapId: MapId;
  /** Rendered frames since mount — the FPS sample base under frameloop="demand". */
  frames: number;
}

declare global {
  interface Window {
    __worldDiag?: WorldDiag;
  }
}

export function worldDiag(): WorldDiag | undefined {
  return window.__worldDiag;
}
