import { describe, expect, it } from 'vitest';
import {
  gardenAdventureCatalog,
  gardenChapterIdForMap,
  validateGardenAdventureCatalog,
} from './catalog.js';

type MutableChapter = {
  id: string;
  mapIds: string[];
  questChains: { id: string; alternativeQuestIds: string[] }[];
  npcIds: string[];
  dialogueIds: string[];
  inventoryItemIds: string[];
  equipmentSlotIds: string[];
  abilityIds: string[];
  encounterIds: string[];
  cinematicIds: string[];
  conditionalSceneObjects: Record<string, string>;
  assetBindings: Record<string, string>;
};

type MutableCatalog = {
  readonly mapConnections: {
    readonly id: string;
    readonly fromMap: string;
    readonly toMap: string;
  }[];
  chapters: MutableChapter[];
};

function validateCatalog(catalog: MutableCatalog): readonly string[] {
  return (
    validateGardenAdventureCatalog as unknown as (value: MutableCatalog) => readonly string[]
  )(catalog);
}

describe('Garden adventure content catalog', () => {
  it('connects the current maps and resolves chapter membership from the existing save map', () => {
    expect(validateGardenAdventureCatalog()).toEqual([]);
    expect(gardenAdventureCatalog.mapConnections).toHaveLength(2);
    expect(gardenAdventureCatalog.mapConnections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromMap: 'map-village', toMap: 'map-garden' }),
        expect.objectContaining({ fromMap: 'map-garden', toMap: 'map-village' }),
      ]),
    );
    expect(gardenChapterIdForMap('village')).toBe('chapter-garden-awakening');
    expect(gardenChapterIdForMap('garden')).toBe('chapter-garden-awakening');
    expect(gardenAdventureCatalog.persistence.schemaVersion).toBe(2);
  });

  it('indexes the game-owned narrative, progression, tactical and cinematic definitions', () => {
    const chapter = gardenAdventureCatalog.chapters[0]!;
    expect(chapter.questChains[0]?.alternativeQuestIds).toEqual([
      'gardener-quest',
      'lantern-quest',
    ]);
    expect(chapter.encounterIds).toContain('guardian-trial');
    expect(chapter.assetBindings['garden-hero']).toBe('phase5-animated-guardian');
    expect(chapter.cinematicIds).toEqual(['garden-tree-ending', 'garden-lantern-ending']);
  });

  it('validates gameplay categories, NPCs, cinematics, conditional facts, and asset bindings', () => {
    const invalid = structuredClone(gardenAdventureCatalog) as unknown as MutableCatalog;
    const chapter = invalid.chapters[0]!;
    chapter.inventoryItemIds = ['guardian-trial'];
    chapter.equipmentSlotIds = ['garden-reward'];
    chapter.abilityIds = ['charm'];
    chapter.encounterIds = ['light-ray'];
    chapter.npcIds.push('missing-npc');
    chapter.cinematicIds.push('missing-cinematic');
    chapter.conditionalSceneObjects['missing-fact'] = 'unknown-scene-object';
    chapter.assetBindings['garden-hero'] = 'phase5-textured-static';

    const errors = validateCatalog(invalid);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown inventory item guardian-trial'),
        expect.stringContaining('unknown equipment slot garden-reward'),
        expect.stringContaining('unknown ability charm'),
        expect.stringContaining('unknown encounter light-ray'),
        expect.stringContaining('unknown NPC missing-npc'),
        expect.stringContaining('unknown cinematic missing-cinematic'),
        expect.stringContaining('conditional scene object missing-fact references unknown fact'),
        expect.stringContaining('asset binding garden-hero does not match its model policy'),
      ]),
    );
  });

  it('requires every map to have exactly one owning chapter', () => {
    const missing = structuredClone(gardenAdventureCatalog) as unknown as MutableCatalog;
    missing.chapters[0]!.mapIds = ['village'];
    const missingErrors = validateCatalog(missing);
    expect(missingErrors).toContain('Map garden has no chapter owner.');
    expect(missingErrors).toContain(
      'chapter-garden-awakening: NPC guardian is outside its chapter map ownership.',
    );

    const duplicated = structuredClone(gardenAdventureCatalog) as unknown as MutableCatalog;
    duplicated.chapters.push({
      ...duplicated.chapters[0]!,
      id: 'chapter-duplicate-owner',
      mapIds: ['garden'],
    });
    expect(validateCatalog(duplicated)).toContain('Map garden belongs to multiple chapters.');
  });
});
