import { describe, expect, it } from 'vitest';
import { ANCHORS } from './navigation/graph.ts';
import {
  FACT_DECORATIONS,
  GROUND_DECORATIONS,
  HIDDEN_FINDS,
  decorationFootprint,
  isDecorationClear,
} from './decorations.ts';
import { getQuestDefinition } from '../domain/quests/definitions.ts';

describe('GROUND_DECORATIONS', () => {
  it('every authored footprint clears anchors, NPCs, landmarks, props and path corridors', () => {
    for (const slot of GROUND_DECORATIONS) {
      const footprint = decorationFootprint(slot);
      expect(
        isDecorationClear(slot.x, slot.z, footprint),
        `slot at ${slot.x},${slot.z} (${slot.kind} scale ${slot.scale ?? 1}, footprint ${footprint})`,
      ).toBe(true);
    }
  });

  it('slots only appear at their declared detail level', () => {
    for (const slot of GROUND_DECORATIONS) {
      expect(slot.minDetail === 1 || slot.minDetail === 2).toBe(true);
    }
  });
});

describe('isDecorationClear', () => {
  it('rejects anchor positions', () => {
    expect(isDecorationClear(0, 0)).toBe(false); // anchor-square
    expect(isDecorationClear(6, 0)).toBe(false); // anchor-shop
  });

  it('rejects path corridors', () => {
    expect(isDecorationClear(1.5, 0.1)).toBe(false); // east path
    expect(isDecorationClear(0.1, -4.5)).toBe(false); // north path
  });

  it('rejects NPC standpoints and landmark footprints', () => {
    expect(isDecorationClear(6.9, -0.4)).toBe(false); // shopkeeper
    expect(isDecorationClear(0, -7.2)).toBe(false); // home-gate landmark
    expect(isDecorationClear(-6, 0)).toBe(false); // fountain
  });

  it('accounts for the decoration footprint, not just its center', () => {
    // A point north of the square↔east corridor: the center alone clears,
    // but a large patch scaled to ~2.4 world units (footprint ≈1.32) would
    // still overlap the corridor.
    const x = 2.2;
    const z = -1.2;
    expect(isDecorationClear(x, z, 0)).toBe(true); // center clears
    expect(isDecorationClear(x, z, 1.32)).toBe(false); // footprint does not
  });
});

describe('HIDDEN_FINDS (Delight PR 3)', () => {
  it('every authored find spot is reachable ground: clear of decor, hotspots, and corridors', () => {
    for (const find of HIDDEN_FINDS) {
      expect(isDecorationClear(find.x, find.z, 0.55)).toBe(true);
      // ...and of the decoration slots themselves — a leaf pile must not
      // sit on an existing flower/stone/plant/patch footprint.
      for (const decor of GROUND_DECORATIONS) {
        const overlap =
          Math.hypot(find.x - decor.x, find.z - decor.z) < decorationFootprint(decor) + 0.55;
        expect(overlap, `find ${find.id} overlaps decor at ${decor.x},${decor.z}`).toBe(false);
      }
    }
  });

  it('every find sits near a walkable anchor — a child can actually get to it', () => {
    // Finds live on map-town — nearby-anchor distance is per-map: an anchor
    // on another map sharing local coordinates is not "reachable ground".
    const walkable = ANCHORS.filter((a) => a.walkable && a.mapId === 'map-town');
    for (const find of HIDDEN_FINDS) {
      const nearest = Math.min(...walkable.map((a) => Math.hypot(a.x - find.x, a.z - find.z)));
      expect(nearest).toBeLessThan(2.5);
      expect(nearest).toBeGreaterThan(0.9); // not sitting ON a tap surface
    }
  });
});

describe('FACT_DECORATIONS (Delight PR 4)', () => {
  it('each row derives from a real quest — world memory is never a bare flag', () => {
    for (const deco of FACT_DECORATIONS) {
      expect(getQuestDefinition(deco.questId)).toBeDefined();
    }
  });

  it('every earned decoration spot is genuinely clear of decor, hotspots, and corridors', () => {
    for (const deco of FACT_DECORATIONS) {
      expect(isDecorationClear(deco.x, deco.z, 0.5), `deco ${deco.id}`).toBe(true);
      for (const decor of GROUND_DECORATIONS) {
        const overlap =
          Math.hypot(deco.x - decor.x, deco.z - decor.z) < decorationFootprint(decor) + 0.5;
        expect(overlap, `deco ${deco.id} overlaps decor at ${decor.x},${decor.z}`).toBe(false);
      }
    }
  });

  it('every decoration sits near the quest anchor it belongs to', () => {
    for (const deco of FACT_DECORATIONS) {
      const quest = getQuestDefinition(deco.questId);
      const anchor = ANCHORS.find((a) => a.id === quest.anchorId);
      expect(anchor).toBeDefined();
      // Beside the landmark it commemorates — readable as belonging to the
      // quest's place, not floating somewhere unrelated.
      expect(Math.hypot(anchor!.x - deco.x, anchor!.z - deco.z)).toBeLessThan(2.6);
    }
  });
});
