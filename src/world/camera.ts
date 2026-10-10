import type { MapId } from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import { getMap } from './maps.ts';
import { CAMERA_PADDING, clampZoom, DEFAULT_ZOOM } from '../framework/index.ts';

// Pure follow-camera math (ISO offset, zoom bands, target clamping, focus
// overrides) moved to `framework/three/camera.ts`; re-exported via the public
// index so existing `world/camera.ts` imports keep working.
export {
  CAMERA_PADDING,
  clampCameraTarget,
  clampUserZoom,
  clampZoom,
  DEFAULT_ZOOM,
  ISO_OFFSET,
  MAX_ZOOM,
  MIN_ZOOM,
  resolveCameraSource,
  shouldApplyPan,
  shouldCancelGestureOnOverrideTransition,
  USER_ZOOM_MAX,
  USER_ZOOM_MIN,
} from '../framework/index.ts';
export type {
  CameraBounds,
  CameraFocusOverride,
  CameraFocusOverrideRequest,
  CameraTarget,
} from '../framework/index.ts';

/** The zoom a map renders with: its authored override or the default. */
export function zoomForMap(source: WorldSource, mapId: MapId): number {
  return clampZoom(getMap(source, mapId).cameraZoom ?? DEFAULT_ZOOM);
}

/** The padding a map renders with: its authored override or the default. */
export function cameraPaddingForMap(source: WorldSource, mapId: MapId): number {
  return getMap(source, mapId).cameraPadding ?? CAMERA_PADDING;
}
