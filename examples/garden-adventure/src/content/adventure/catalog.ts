import { gardenNarrativeDefinition } from '../story.js';
import { gardenGameplayDefinition } from '../gameplay.js';
import { gardenModelRecords, GARDEN_MODEL_IDS } from '../../models/asset-records.js';
import { createGardenEndingTimeline } from '../../presentation/ending-cinematic.js';
import { gardenMaps, gardenTargets, mapTransitions, type GardenMapId } from '../../world/world.js';

export interface GardenAdventureChapter {
  readonly id: string;
  readonly mapIds: readonly GardenMapId[];
  readonly questChains: readonly {
    readonly id: string;
    readonly alternativeQuestIds: readonly string[];
  }[];
  readonly npcIds: readonly string[];
  readonly dialogueIds: readonly string[];
  readonly inventoryItemIds: readonly string[];
  readonly equipmentSlotIds: readonly string[];
  readonly abilityIds: readonly string[];
  readonly encounterIds: readonly string[];
  readonly cinematicIds: readonly string[];
  readonly conditionalSceneObjects: Readonly<Record<string, string>>;
  readonly assetBindings: Readonly<Record<string, string>>;
}

/** Game-owned index of the current slice; new maps and chapters extend this list. */
export const gardenAdventureCatalog = Object.freeze({
  schemaVersion: 1,
  gameId: 'garden-of-stories',
  mapConnections: mapTransitions.map((transition) => ({
    id: transition.id,
    fromMap: transition.fromMap,
    toMap: transition.toMap,
  })),
  chapters: [
    {
      id: 'chapter-garden-awakening',
      mapIds: ['village', 'garden'],
      questChains: [
        {
          id: 'choose-how-to-help-the-garden',
          alternativeQuestIds: ['gardener-quest', 'lantern-quest'],
        },
      ],
      npcIds: gardenTargets
        .filter(
          (target) =>
            target.kind === 'gardener' || target.kind === 'traveler' || target.kind === 'guardian',
        )
        .map((target) => target.id),
      dialogueIds: gardenNarrativeDefinition.dialogues.map((dialogue) => dialogue.id),
      inventoryItemIds: gardenGameplayDefinition.items.map((item) => item.id),
      equipmentSlotIds: gardenGameplayDefinition.equipmentSlots.map((slot) => slot.id),
      abilityIds: gardenGameplayDefinition.abilities.map((ability) => ability.id),
      encounterIds: gardenGameplayDefinition.encounters.map((encounter) => encounter.id),
      cinematicIds: [
        createGardenEndingTimeline('ending-garden').id,
        createGardenEndingTimeline('ending-lantern').id,
      ],
      conditionalSceneObjects: {
        'tree-grown': 'garden-grown-tree',
        'lantern-lit': 'lantern-warm-light',
      },
      assetBindings: {
        'garden-hero': GARDEN_MODEL_IDS.animatedCharacter,
        'garden-guardian': GARDEN_MODEL_IDS.animatedCharacter,
        'ancient-lantern-base': GARDEN_MODEL_IDS.lanternBase,
      },
    } satisfies GardenAdventureChapter,
  ],
  localization: {
    defaultLocale: 'fa-IR',
    locales: ['fa-IR'],
    contentModule: 'src/content/fa/ui.ts',
  },
  accessibility: {
    reducedMotion: 'skip-camera-movement-and-use-static-semantic-poses',
    interaction: 'touch-keyboard-and-screen-reader-supported',
    minimumTouchTargetCssVariable: '--touch-min',
  },
  persistence: {
    schemaVersion: 2,
    chapterDerivedFrom: 'saved-map-id',
  },
});

export type GardenChapterId = (typeof gardenAdventureCatalog.chapters)[number]['id'];

const chapterByMap: Readonly<Record<GardenMapId, GardenChapterId>> = Object.freeze({
  village: 'chapter-garden-awakening',
  garden: 'chapter-garden-awakening',
});

export function gardenChapterIdForMap(mapId: GardenMapId): GardenChapterId {
  return chapterByMap[mapId];
}

export function validateGardenAdventureCatalog(): readonly string[] {
  const errors: string[] = [];
  const chapterIds = new Set(gardenAdventureCatalog.chapters.map((chapter) => chapter.id));
  const narrativeQuestIds = new Set(gardenNarrativeDefinition.quests.map((quest) => quest.id));
  const gameplayIds = new Set([
    ...gardenGameplayDefinition.items.map((item) => item.id),
    ...gardenGameplayDefinition.equipmentSlots.map((slot) => slot.id),
    ...gardenGameplayDefinition.abilities.map((ability) => ability.id),
    ...gardenGameplayDefinition.encounters.map((encounter) => encounter.id),
  ]);
  const modelIds = new Set(gardenModelRecords.map((record) => record.id));
  const dialogueIds = new Set(gardenNarrativeDefinition.dialogues.map((dialogue) => dialogue.id));
  const mapKeys = new Set(Object.keys(gardenMaps));
  const mapIds = new Set(Object.values(gardenMaps).map((map) => map.id));

  for (const chapter of gardenAdventureCatalog.chapters) {
    if (!chapter.id || !chapter.mapIds.length)
      errors.push('Every chapter needs a stable ID and map.');
    for (const mapId of chapter.mapIds)
      if (!mapKeys.has(mapId)) errors.push(`${chapter.id}: unknown map ${mapId}.`);
    for (const chain of chapter.questChains)
      for (const questId of chain.alternativeQuestIds)
        if (!narrativeQuestIds.has(questId))
          errors.push(`${chapter.id}: unknown quest ${questId}.`);
    for (const dialogueId of chapter.dialogueIds)
      if (!dialogueIds.has(dialogueId))
        errors.push(`${chapter.id}: unknown dialogue ${dialogueId}.`);
    for (const id of [
      ...chapter.inventoryItemIds,
      ...chapter.equipmentSlotIds,
      ...chapter.abilityIds,
      ...chapter.encounterIds,
    ])
      if (!gameplayIds.has(id)) errors.push(`${chapter.id}: unknown gameplay definition ${id}.`);
    for (const [owner, assetId] of Object.entries(chapter.assetBindings))
      if (!owner || !modelIds.has(assetId)) errors.push(`${chapter.id}: unknown model ${assetId}.`);
  }

  for (const connection of gardenAdventureCatalog.mapConnections) {
    if (!mapIds.has(connection.fromMap) || !mapIds.has(connection.toMap))
      errors.push(`Map connection ${connection.id} references an unknown map.`);
  }
  for (const [mapId, chapterId] of Object.entries(chapterByMap))
    if (!mapKeys.has(mapId) || !chapterIds.has(chapterId))
      errors.push(`Chapter persistence mapping is invalid for ${mapId}.`);
  return errors;
}
