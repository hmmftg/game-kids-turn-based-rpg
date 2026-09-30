import { describe, expect, it } from 'vitest';
import {
  clampCameraTarget,
  cameraPaddingForMap,
  zoomForMap,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
} from './camera.ts';
import { WORLD_MAPS, getMap } from './maps.ts';
import { getAnchor } from './navigation/graph.ts';

const TOWN = getMap('map-town').bounds;
const CAVE = getMap('map-cave').bounds;
const PAD = 1.0;

// The clamp's footprint inset for a viewport/zoom pair (must match the
// implementation's projection math).
const inset = (w: number, h: number, zoom: number) => {
  const hw = w / (2 * zoom);
  const hh = h / (2 * zoom);
  return hw / Math.SQRT2 + hh / Math.sqrt(6);
};

describe('clampCameraTarget', () => {
  const LANDSCAPE = { w: 880, h: 420 };
  const PORTRAIT = { w: 360, h: 800 };

  it('leaves a centered target untouched', () => {
    const t = clampCameraTarget({ x: 0, z: 0 }, TOWN, LANDSCAPE.w, LANDSCAPE.h, 64, PAD);
    expect(t.x).toBe(0);
    expect(t.z).toBe(0);
  });

  it('clamps the player at the western edge instead of scrolling past the map', () => {
    const hx = inset(LANDSCAPE.w, LANDSCAPE.h, 64);
    const t = clampCameraTarget({ x: TOWN.minX, z: 0 }, TOWN, LANDSCAPE.w, LANDSCAPE.h, 64, PAD);
    expect(t.x).toBeCloseTo(TOWN.minX + PAD + hx, 5);
    expect(t.x).toBeGreaterThan(TOWN.minX);
  });

  it('clamps the player at the eastern edge', () => {
    const hx = inset(LANDSCAPE.w, LANDSCAPE.h, 64);
    const t = clampCameraTarget({ x: TOWN.maxX, z: 0 }, TOWN, LANDSCAPE.w, LANDSCAPE.h, 64, PAD);
    expect(t.x).toBeCloseTo(TOWN.maxX - PAD - hx, 5);
  });

  it('clamps north and south edges too', () => {
    const hz = inset(LANDSCAPE.w, LANDSCAPE.h, 64);
    const south = clampCameraTarget({ x: 0, z: TOWN.maxZ }, TOWN, LANDSCAPE.w, LANDSCAPE.h, 64, PAD);
    const north = clampCameraTarget({ x: 0, z: TOWN.minZ }, TOWN, LANDSCAPE.w, LANDSCAPE.h, 64, PAD);
    expect(south.z).toBeCloseTo(TOWN.maxZ - PAD - hz, 5);
    expect(north.z).toBeCloseTo(TOWN.minZ + PAD + hz, 5);
  });

  it('pins a map smaller than the viewport to its center (cave, landscape)', () => {
    const t = clampCameraTarget({ x: 4, z: 4 }, CAVE, 1920, 1080, 46, PAD);
    expect(t.x).toBeCloseTo((CAVE.minX + CAVE.maxX) / 2, 5);
    expect(t.z).toBeCloseTo((CAVE.minZ + CAVE.maxZ) / 2, 5);
  });

  it('clamps more aggressively in a narrow portrait viewport than landscape', () => {
    const land = clampCameraTarget({ x: TOWN.minX, z: 0 }, TOWN, LANDSCAPE.w, LANDSCAPE.h, 64, PAD);
    const port = clampCameraTarget({ x: TOWN.minX, z: 0 }, TOWN, PORTRAIT.w, PORTRAIT.h, 64, PAD);
    // Narrower viewport → smaller horizontal footprint → target may reach
    // closer to the edge while still revealing no outside space.
    expect(port.x).toBeLessThanOrEqual(land.x + 1e-9);
    expect(port.x).toBeGreaterThan(TOWN.minX);
  });

  it('zooming in reduces the visible footprint and lets the target roam wider', () => {
    const wide = clampCameraTarget({ x: TOWN.minX, z: 0 }, TOWN, 880, 420, MIN_ZOOM, PAD);
    const tight = clampCameraTarget({ x: TOWN.minX, z: 0 }, TOWN, 880, 420, MAX_ZOOM, PAD);
    expect(tight.x).toBeLessThan(wide.x);
  });

  it('is deterministic', () => {
    const a = clampCameraTarget({ x: -7, z: 3 }, TOWN, 880, 420, 64, PAD);
    const b = clampCameraTarget({ x: -7, z: 3 }, TOWN, 880, 420, 64, PAD);
    expect(a).toEqual(b);
  });

  it('keeps every town spawn and boundary anchor inside the clamped range', () => {
    for (const map of WORLD_MAPS) {
      const pad = cameraPaddingForMap(map.id);
      const zoom = zoomForMap(map.id);
      const spawn = getAnchor(map.spawnAnchorId);
      const t = clampCameraTarget(spawn, map.bounds, 880, 420, zoom, pad);
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.z)).toBe(true);
      expect(t.x).toBeGreaterThanOrEqual(map.bounds.minX);
      expect(t.x).toBeLessThanOrEqual(map.bounds.maxX);
    }
  });
});

describe('map camera presentation', () => {
  it('every map resolves a zoom inside the bounds', () => {
    for (const map of WORLD_MAPS) {
      const zoom = zoomForMap(map.id);
      expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });

  it('town uses the default zoom; the cave is tighter', () => {
    expect(zoomForMap('map-town')).toBe(DEFAULT_ZOOM);
    expect(zoomForMap('map-cave')).toBeGreaterThan(zoomForMap('map-town'));
  });
});
