/**
 * The framework's single public entry. Every application import of framework
 * code — including type-only imports — goes through this file; ESLint
 * (`no-restricted-imports`) enforces it. This facade combines the reusable
 * package API with application-owned capabilities, camera math and gameplay
 * modules. The hello-world consumer validates the package root directly.
 *
 * Deliberate exception: `core/perfProbe.ts` is NOT re-exported. It must stay a
 * separately addressable lazy chunk — `?perfprobe=1` loads it via a direct
 * dynamic `import()` in `main.tsx` so profiling costs the normal bundle and
 * the PWA precache zero bytes.
 */

export * from 'waypoint-rpg-core';

export type { QualityTier } from './core/quality.ts';
export {
  currentOrientation,
  detectQualityTier,
  detectWebgl,
  maxPixelRatioFor,
  prefersReducedMotion,
} from './core/capabilities.ts';

export {
  CAMERA_ORBIT_SENSITIVITY,
  CAMERA_PADDING,
  CAMERA_PITCH_MAX,
  CAMERA_PITCH_MIN,
  CAMERA_RADIUS,
  CAMERA_YAW_MAX,
  CAMERA_YAW_MIN,
  cameraOffsetFromAngles,
  clampCameraPitch,
  clampCameraTarget,
  clampCameraYaw,
  clampUserZoom,
  clampZoom,
  DEFAULT_CAMERA_PITCH,
  DEFAULT_CAMERA_YAW,
  DEFAULT_ZOOM,
  ISO_OFFSET,
  MAX_ZOOM,
  MIN_ZOOM,
  resolveCameraSource,
  shouldApplyPan,
  shouldCancelGestureOnOverrideTransition,
  USER_ZOOM_MAX,
  USER_ZOOM_MIN,
} from './three/camera.ts';
export type {
  CameraBounds,
  CameraFocusOverride,
  CameraFocusOverrideRequest,
  CameraTarget,
} from './three/camera.ts';
