import type { MapId } from '../domain/game/types.ts';
import type { WorldSource } from '../domain/world/source.ts';
import { getMap } from './maps.ts';

/**
 * Follow-camera math — pure and deterministic.
 *
 * The orthographic camera sits at `target + (ISO, ISO_Y, ISO)` and looks at
 * the target, so a ground point (x, z) projects to screen coordinates
 * u = (x−z)/√2 (horizontal) and v = (x+z)/√6 (vertical). At a given ortho
 * zoom and pixel viewport, the visible ground footprint around the camera
 * target is bounded — `clampCameraTarget` keeps that footprint inside the
 * map rectangle so the camera can never reveal outside-map space.
 */

/** Isometric offset direction: camera position = target + ISO_OFFSET. */
export const ISO_OFFSET = { x: 10, y: 10, z: 10 } as const;

/** Gameplay zoom bounds (ortho zoom = px per world unit, both axes). */
export const MIN_ZOOM = 20;
export const MAX_ZOOM = 96;
export const DEFAULT_ZOOM = 64;

/** Child-facing zoom factor applied on top of a map's zoom (PR T): a
    multiplicative band around 1.0 — zoomed out enough to read the area,
    zoomed in enough to read a figure, never far enough to lose context. */
export const USER_ZOOM_MIN = 0.75;
export const USER_ZOOM_MAX = 1.35;
export const clampUserZoom = (factor: number): number =>
  Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, factor));

const SQRT6 = Math.sqrt(6);

export interface CameraBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface CameraTarget {
  readonly x: number;
  readonly z: number;
}

/**
 * The default padding that keeps scenery close to the target instead of
 * hugging the authored walkable bounds. A map may widen it via
 * `cameraPadding`; the clamp itself lives in `clampCameraTarget`.
 */
export const CAMERA_PADDING = 1.0;

/**
 * Clamp a desired camera target so the viewport never scrolls beyond the
 * playable map.
 *
 * viewportW/viewportH are canvas pixels, zoom is ortho px-per-world-unit.
 * The viewport's half-extents are hw = w/(2·zoom) in the u=(x−z)/√2 axis and
 * hh = h/(2·zoom) in the v=(x+z)/√6 axis. Requiring that footprint inside
 * the (padded) map rect insets each world axis by hx = hw/√2 + hh/√6.
 * When the inset exceeds the map extent the map is smaller than the
 * viewport — the target is pinned to the rect's center instead.
 */
export function clampCameraTarget(
  target: CameraTarget,
  bounds: CameraBounds,
  viewportW: number,
  viewportH: number,
  zoom: number,
  padding: number = CAMERA_PADDING,
): CameraTarget {
  const inner: CameraBounds = {
    minX: bounds.minX + padding,
    maxX: bounds.maxX - padding,
    minZ: bounds.minZ + padding,
    maxZ: bounds.maxZ - padding,
  };
  const hw = viewportW / (2 * zoom);
  const hh = viewportH / (2 * zoom);
  const hx = hw / Math.SQRT2 + hh / SQRT6;
  const hz = hw / Math.SQRT2 + hh / SQRT6;
  const clampAxis = (value: number, min: number, max: number): number => {
    if (min > max) return (min + max) / 2;
    return Math.min(max, Math.max(min, value));
  };
  return {
    x: clampAxis(target.x, inner.minX + hx, inner.maxX - hx),
    z: clampAxis(target.z, inner.minZ + hz, inner.maxZ - hz),
  };
}

/** The zoom a map renders with: its authored override or the default. */
export function zoomForMap(source: WorldSource, mapId: MapId): number {
  const override = getMap(source, mapId).cameraZoom;
  const zoom = override ?? DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The padding a map renders with: its authored override or the default. */
export function cameraPaddingForMap(source: WorldSource, mapId: MapId): number {
  return getMap(source, mapId).cameraPadding ?? CAMERA_PADDING;
}
