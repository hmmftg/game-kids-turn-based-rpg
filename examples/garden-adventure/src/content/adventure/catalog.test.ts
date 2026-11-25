import { describe, expect, it } from 'vitest';
import {
  gardenAdventureCatalog,
  gardenChapterIdForMap,
  validateGardenAdventureCatalog,
} from './catalog.js';

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
});
