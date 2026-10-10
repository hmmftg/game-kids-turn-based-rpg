import { beforeEach, describe, expect, it } from 'vitest';
import {
  resolveCameraSource,
  shouldApplyPan,
  shouldCancelGestureOnOverrideTransition,
} from './camera.ts';
import {
  clearCameraFocusOverride,
  getCameraFocusOverride,
  setCameraFocusOverride,
  updateCameraFocusOverride,
} from './CameraRig.tsx';

// The override store is module-level — reset it between tests by clearing
// through the owning token (the only legitimate clear path).
beforeEach(() => {
  const active = getCameraFocusOverride();
  if (active !== null) clearCameraFocusOverride(active.token);
});

describe('resolveCameraSource', () => {
  const MAP_ZOOM = 64;
  const MAP_PADDING = 1.0;

  it('returns base focus under the map zoom/padding when no override is set', () => {
    const src = resolveCameraSource({ x: 2, z: -3 }, null, MAP_ZOOM, MAP_PADDING);
    expect(src).toEqual({ x: 2, z: -3, zoom: MAP_ZOOM, padding: MAP_PADDING });
  });

  it('returns the override target while active, ignoring base updates', () => {
    const token = setCameraFocusOverride({ x: 5, z: 5, zoom: 80 });
    const base = { x: 0, z: 0 };
    // The base keeps tracking the avatar underneath the override.
    base.x = 9;
    base.z = 9;
    const src = resolveCameraSource(base, getCameraFocusOverride(), MAP_ZOOM, MAP_PADDING);
    expect(src).toEqual({ x: 5, z: 5, zoom: 80, padding: MAP_PADDING });
    clearCameraFocusOverride(token);
  });

  it('selects zoom and padding from the request, padding falling back to the map', () => {
    const withPad = setCameraFocusOverride({ x: 1, z: 1, zoom: 90, padding: 2.5 });
    expect(
      resolveCameraSource({ x: 0, z: 0 }, getCameraFocusOverride(), MAP_ZOOM, MAP_PADDING).padding,
    ).toBe(2.5);
    clearCameraFocusOverride(withPad);
    const noPad = setCameraFocusOverride({ x: 1, z: 1, zoom: 90 });
    const src = resolveCameraSource(
      { x: 0, z: 0 },
      getCameraFocusOverride(),
      MAP_ZOOM,
      MAP_PADDING,
    );
    expect(src.padding).toBe(MAP_PADDING);
    clearCameraFocusOverride(noPad);
  });

  it('follows the LATEST base after clearing, not the entry snapshot', () => {
    const base = { x: 1, z: 1 };
    const token = setCameraFocusOverride({ x: 5, z: 5, zoom: 80 });
    // The avatar keeps walking while the override is active.
    base.x = 7;
    base.z = -2;
    clearCameraFocusOverride(token);
    const src = resolveCameraSource(base, getCameraFocusOverride(), MAP_ZOOM, MAP_PADDING);
    expect(src).toEqual({ x: 7, z: -2, zoom: MAP_ZOOM, padding: MAP_PADDING });
  });
});

describe('override store ownership', () => {
  it('returns increasing tokens; a second set supersedes the first', () => {
    const t1 = setCameraFocusOverride({ x: 1, z: 1, zoom: 70 });
    const t2 = setCameraFocusOverride({ x: 2, z: 2, zoom: 70 });
    expect(t2).toBeGreaterThan(t1);
    expect(getCameraFocusOverride()).toMatchObject({ x: 2, z: 2, token: t2 });
    clearCameraFocusOverride(t2);
  });

  it('a stale token cannot clear the newer override', () => {
    const t1 = setCameraFocusOverride({ x: 1, z: 1, zoom: 70 });
    const t2 = setCameraFocusOverride({ x: 2, z: 2, zoom: 70 });
    // The first owner's cleanup runs late — it must be a no-op.
    clearCameraFocusOverride(t1);
    expect(getCameraFocusOverride()).toMatchObject({ x: 2, z: 2, token: t2 });
    clearCameraFocusOverride(t2);
    expect(getCameraFocusOverride()).toBeNull();
  });

  it('clears to null only with the owning token', () => {
    const token = setCameraFocusOverride({ x: 3, z: 3, zoom: 70 });
    clearCameraFocusOverride(token + 999);
    expect(getCameraFocusOverride()).not.toBeNull();
    clearCameraFocusOverride(token);
    expect(getCameraFocusOverride()).toBeNull();
  });

  it('updates apply only with the owning token', () => {
    const t1 = setCameraFocusOverride({ x: 1, z: 1, zoom: 70 });
    const t2 = setCameraFocusOverride({ x: 2, z: 2, zoom: 70 });
    updateCameraFocusOverride(t1, { x: 99 });
    expect(getCameraFocusOverride()).toMatchObject({ x: 2, z: 2 });
    updateCameraFocusOverride(t2, { x: 8, zoom: 88 });
    expect(getCameraFocusOverride()).toMatchObject({ x: 8, z: 2, zoom: 88, token: t2 });
    clearCameraFocusOverride(t2);
  });
});

describe('pan arbitration', () => {
  it('suppresses pan under an active override and restores it after clear', () => {
    expect(shouldApplyPan(null)).toBe(true);
    const token = setCameraFocusOverride({ x: 0, z: 0, zoom: 70 });
    expect(shouldApplyPan(getCameraFocusOverride())).toBe(false);
    clearCameraFocusOverride(token);
    expect(shouldApplyPan(getCameraFocusOverride())).toBe(true);
  });

  // Behavioral contract the rig implements in useFrame: a drag started
  // before the override, held physically across it, and moved after it
  // clears must NOT jump the camera — both transitions cancel the gesture
  // so only a fresh pointerdown may pan.
  it('signals a gesture cancel on BOTH override transitions', () => {
    expect(shouldCancelGestureOnOverrideTransition(false, true)).toBe(true);
    expect(shouldCancelGestureOnOverrideTransition(true, false)).toBe(true);
    expect(shouldCancelGestureOnOverrideTransition(false, false)).toBe(false);
    expect(shouldCancelGestureOnOverrideTransition(true, true)).toBe(false);
  });
});
