import { describe, expect, it } from 'vitest';
import type { Anchor } from '../domain/world/types.ts';
import { cameraPaddingForMap, clampCameraTarget, DEFAULT_ZOOM } from './camera.ts';
import { FOUNTAIN_BASIN, INITIAL_CRITTER_PLACEMENTS } from './critters.ts';
import { getAnchorOrNull } from './navigation/graph.ts';
import { npcFigureJitter } from './registry.ts';
import {
  CAVE_MOUSE_OFFSET,
  caveEntranceRockPosition,
  landmarkPosition,
  NPC_STAND_OFFSET,
} from './placement.ts';
import { STATIC_WORLD_SOURCE } from './worldSource.ts';

/**
 * Spatial invariants — the contract behind the Phase-C "edge content is
 * disappearing" and "fish outside the fountain" fixes.
 *
 * `clampCameraTarget` keeps the orthographic footprint inside
 * `map.bounds - cameraPadding`, so the *guaranteed-visible region* — the set
 * of ground points the camera can frame at some legal target — is exactly
 * that inset rectangle. Anything outside it can never be seen; anything
 * hugging its edge can be clipped. These tests pin:
 *
 *  1. Visibility    — every interactive target inside the guaranteed region.
 *  2. Clearance     — …plus a margin, so targets are never partially clipped.
 *  3. Containment   — fish rest/swim inside the fountain's water volume.
 *  4. Stability     — derived visuals come from the anchor transform, so
 *                     nothing can drift into its own coordinate again.
 */

/** Minimum margin inside the guaranteed-visible rect for interaction targets. */
const INTERACTION_CLEARANCE = 0.6;

/** The water disc the fountain variant actually renders (FountainDetails). */
const FOUNTAIN_WATER_RADIUS = 0.65;

interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function guaranteedVisible(mapId: string): Rect {
  const map = STATIC_WORLD_SOURCE.maps.find((m) => m.id === mapId);
  if (!map) throw new Error(`unknown map ${mapId}`);
  const padding = cameraPaddingForMap(STATIC_WORLD_SOURCE, map.id);
  return {
    minX: map.bounds.minX + padding,
    maxX: map.bounds.maxX - padding,
    minZ: map.bounds.minZ + padding,
    maxZ: map.bounds.maxZ - padding,
  };
}

function inside(rect: Rect, p: { x: number; z: number }, margin: number): boolean {
  return (
    p.x >= rect.minX + margin &&
    p.x <= rect.maxX - margin &&
    p.z >= rect.minZ + margin &&
    p.z <= rect.maxZ - margin
  );
}

const interactive = (anchor: Anchor): boolean =>
  anchor.walkable ||
  anchor.npcId !== null ||
  anchor.landmarkId !== null ||
  anchor.transitionId !== null;

describe('guaranteed-visible interaction region', () => {
  it('every interactive anchor is inside the camera-guaranteed rect with clearance', () => {
    for (const map of STATIC_WORLD_SOURCE.maps) {
      const rect = guaranteedVisible(map.id);
      for (const anchor of STATIC_WORLD_SOURCE.anchors) {
        if (anchor.mapId !== map.id || !interactive(anchor)) continue;
        expect(
          inside(rect, anchor, INTERACTION_CLEARANCE),
          `${anchor.id} (${anchor.x},${anchor.z}) must sit ≥${INTERACTION_CLEARANCE}u inside the guaranteed-visible rect of ${map.id}`,
        ).toBe(true);
      }
    }
  });

  it('every landmark render position keeps the same clearance', () => {
    for (const anchor of STATIC_WORLD_SOURCE.anchors) {
      if (anchor.landmarkId === null) continue;
      const rect = guaranteedVisible(anchor.mapId);
      const pos = landmarkPosition(anchor);
      expect(
        inside(rect, pos, INTERACTION_CLEARANCE),
        `${anchor.landmarkId} renders at (${pos.x},${pos.z}) — must stay inside ${anchor.mapId}'s visible rect`,
      ).toBe(true);
    }
  });

  it('every NPC figure position — anchor + stand offset + jitter — keeps clearance', () => {
    for (const npc of STATIC_WORLD_SOURCE.npcDefinitions) {
      const jitter = npcFigureJitter(STATIC_WORLD_SOURCE, npc.id);
      const stands: { anchorId: string; ox: number; oz: number }[] = [];
      const home = STATIC_WORLD_SOURCE.npcPlacements.find((p) => p.npcId === npc.id);
      if (home)
        stands.push({ anchorId: home.anchorId, ox: home.offsetX ?? 0, oz: home.offsetZ ?? 0 });
      for (const spot of npc.schedule?.spots ?? []) {
        stands.push({ anchorId: spot.anchorId, ox: spot.offsetX ?? 0, oz: spot.offsetZ ?? 0 });
      }
      for (const stand of stands) {
        const anchor = getAnchorOrNull(STATIC_WORLD_SOURCE, stand.anchorId);
        if (!anchor) continue;
        // The cave's one resident renders with its own offset and no jitter;
        // town NPCs take the shared stand offset plus deterministic jitter.
        const cave = anchor.mapId === 'map-cave';
        const base = cave ? CAVE_MOUSE_OFFSET : NPC_STAND_OFFSET;
        const jit = cave ? { x: 0, z: 0 } : jitter;
        const figure = {
          x: anchor.x + base.x + stand.ox + jit.x,
          z: anchor.z + base.z + stand.oz + jit.z,
        };
        const rect = guaranteedVisible(anchor.mapId);
        expect(
          inside(rect, figure, INTERACTION_CLEARANCE),
          `${npc.id}@${anchor.id} figure at (${figure.x.toFixed(2)},${figure.z.toFixed(2)}) must stay inside ${anchor.mapId}'s visible rect`,
        ).toBe(true);
      }
    }
  });

  it('the cave-entrance rock — derived from its anchor — keeps clearance', () => {
    const anchor = getAnchorOrNull(STATIC_WORLD_SOURCE, 'anchor-cave-entrance');
    expect(anchor).not.toBeNull();
    const rect = guaranteedVisible('map-town');
    const rock = caveEntranceRockPosition(anchor!);
    expect(inside(rect, rock, INTERACTION_CLEARANCE)).toBe(true);
  });

  it('every interactive anchor is on-canvas from some walkable stand at the smallest framing', () => {
    // Being inside the map rect is not enough: `clampCameraTarget` insets
    // the camera *target* by hw/√2 + hh/√6 on each world axis, so near an
    // edge the camera cannot center on the child — the footprint slides
    // with the clamped target, not the avatar. At the smallest supported
    // portrait (360×800, default zoom) that inset is ~4.5u and the
    // u=(x−z)/√2 footprint is only ±2.81 — exactly how the cave entrance
    // was lost at the old corner spot. Coverage = the target inside the
    // footprint around the *clamped* camera target of some walkable stand.
    const W = 360;
    const H = 800;
    const hw = W / (2 * DEFAULT_ZOOM);
    const hh = H / (2 * DEFAULT_ZOOM);
    const covers = (
      mapId: Anchor['mapId'],
      stand: Anchor,
      target: { x: number; z: number },
    ): boolean => {
      const map = STATIC_WORLD_SOURCE.maps.find((m) => m.id === mapId)!;
      const cam = clampCameraTarget(
        { x: stand.x, z: stand.z },
        map.bounds,
        W,
        H,
        DEFAULT_ZOOM,
        cameraPaddingForMap(STATIC_WORLD_SOURCE, mapId),
      );
      const du = (target.x - cam.x - (target.z - cam.z)) / Math.SQRT2;
      const dv = (target.x - cam.x + (target.z - cam.z)) / Math.sqrt(6);
      return Math.abs(du) <= hw && Math.abs(dv) <= hh;
    };
    const walkableStands = (mapId: string) =>
      STATIC_WORLD_SOURCE.anchors.filter((a) => a.walkable && a.mapId === mapId);
    for (const anchor of STATIC_WORLD_SOURCE.anchors) {
      if (!interactive(anchor)) continue;
      const stands = walkableStands(anchor.mapId);
      expect(
        stands.some((stand) => covers(anchor.mapId, stand, anchor)),
        `${anchor.id} (${anchor.x},${anchor.z}) is outside the ${W}x${H} iso footprint of every walkable anchor on ${anchor.mapId}`,
      ).toBe(true);
      if (anchor.landmarkId !== null) {
        const pos = landmarkPosition(anchor);
        expect(
          stands.some((stand) => covers(anchor.mapId, stand, pos)),
          `${anchor.landmarkId} at (${pos.x},${pos.z}) is unreachable at ${W}x${H} — invisible from every walkable stand`,
        ).toBe(true);
      }
      // The tap surface the child actually aims at is the rock visual, not
      // the bare anchor — it must be on-canvas from some stand too.
      if (anchor.transitionId === 'transition-cave-entrance') {
        const rock = caveEntranceRockPosition(anchor);
        expect(
          stands.some((stand) => covers(anchor.mapId, stand, rock)),
          `cave rock at (${rock.x},${rock.z}) is unreachable at ${W}x${H}`,
        ).toBe(true);
      }
    }

    // The same rule for figures: a person you can never see is a person you
    // can never talk to — this is what hid the fisher's bank spot on main.
    for (const npc of STATIC_WORLD_SOURCE.npcDefinitions) {
      const jitter = npcFigureJitter(STATIC_WORLD_SOURCE, npc.id);
      const stands: { anchorId: string; ox: number; oz: number }[] = [];
      const home = STATIC_WORLD_SOURCE.npcPlacements.find((p) => p.npcId === npc.id);
      if (home)
        stands.push({ anchorId: home.anchorId, ox: home.offsetX ?? 0, oz: home.offsetZ ?? 0 });
      for (const spot of npc.schedule?.spots ?? []) {
        stands.push({ anchorId: spot.anchorId, ox: spot.offsetX ?? 0, oz: spot.offsetZ ?? 0 });
      }
      for (const stand of stands) {
        const anchor = getAnchorOrNull(STATIC_WORLD_SOURCE, stand.anchorId);
        if (!anchor) continue;
        const cave = anchor.mapId === 'map-cave';
        const base = cave ? CAVE_MOUSE_OFFSET : NPC_STAND_OFFSET;
        const jit = cave ? { x: 0, z: 0 } : jitter;
        const figure = {
          x: anchor.x + base.x + stand.ox + jit.x,
          z: anchor.z + base.z + stand.oz + jit.z,
        };
        const stands = walkableStands(anchor.mapId);
        expect(
          stands.some((s) => covers(anchor.mapId, s, figure)),
          `${npc.id}@${anchor.id} figure at (${figure.x.toFixed(2)},${figure.z.toFixed(2)}) is unreachable at ${W}x${H}`,
        ).toBe(true);
      }
    }
  });
});

describe('fountain containment (fish ∈ water)', () => {
  it('the basin is derived from the fountain anchor landmark placement', () => {
    const anchor = getAnchorOrNull(STATIC_WORLD_SOURCE, 'anchor-fountain');
    expect(anchor).not.toBeNull();
    const expected = landmarkPosition(anchor!);
    expect(FOUNTAIN_BASIN.x).toBe(expected.x);
    expect(FOUNTAIN_BASIN.z).toBe(expected.z);
  });

  it('the swim radius stays inside the rendered water disc', () => {
    expect(FOUNTAIN_BASIN.radius).toBeLessThanOrEqual(FOUNTAIN_WATER_RADIUS);
  });

  it('every fish rest position is inside the water volume', () => {
    const fish = INITIAL_CRITTER_PLACEMENTS.filter((c) => c.kind === 'fish');
    expect(fish.length).toBeGreaterThan(0);
    for (const f of fish) {
      const [x, , z] = f.position;
      const dist = Math.hypot(x - FOUNTAIN_BASIN.x, z - FOUNTAIN_BASIN.z);
      expect(dist, `${f.key} rests ${dist.toFixed(2)}u from the basin centre`).toBeLessThanOrEqual(
        FOUNTAIN_WATER_RADIUS,
      );
    }
  });
});
