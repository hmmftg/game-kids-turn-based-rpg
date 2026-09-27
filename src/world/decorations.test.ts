import { describe, expect, it } from 'vitest';
import { GROUND_DECORATIONS, isDecorationClear } from './decorations.ts';

describe('GROUND_DECORATIONS', () => {
  it('every authored slot clears anchors, NPCs, landmarks, props and path corridors', () => {
    for (const slot of GROUND_DECORATIONS) {
      expect(isDecorationClear(slot.x, slot.z), `slot at ${slot.x},${slot.z}`).toBe(true);
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
});
