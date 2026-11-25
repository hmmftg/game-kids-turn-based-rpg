import { gardenNarrativeDefinition } from '../story.js';
import { gardenGameplayDefinition } from '../gameplay.js';
import {
  GARDEN_MODEL_BINDINGS,
  gardenModelBudgetPolicy,
  gardenModelRecords,
  type GardenModelInstanceId,
} from '../../models/asset-records.js';
import { gardenEndingTimelineIds } from '../../presentation/ending-cinematic.js';
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
      cinematicIds: gardenEndingTimelineIds,
      conditionalSceneObjects: {
        'tree-grown': 'garden-grown-tree',
        'lantern-lit': 'lantern-warm-light',
      },
      assetBindings: Object.fromEntries(
        Object.entries(GARDEN_MODEL_BINDINGS).map(([instanceId, binding]) => [
          instanceId,
          binding.assetId,
        ]),
      ),
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

export function gardenChapterIdForMap(mapId: GardenMapId): GardenChapterId {
  const chapter = gardenAdventureCatalog.chapters.find((entry) => entry.mapIds.includes(mapId));
  if (!chapter) throw new Error(`Garden map ${mapId} has no chapter owner.`);
  return chapter.id;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function collectNarrativeWriteKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectNarrativeWriteKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;

  const record = value as { readonly op?: unknown; readonly key?: unknown };
  if (
    (record.op === 'set-fact' || record.op === 'set-flag' || record.op === 'increment-fact') &&
    typeof record.key === 'string'
  )
    keys.add(record.key);
  for (const item of Object.values(value)) collectNarrativeWriteKeys(item, keys);
  return keys;
}

export function validateGardenAdventureCatalog(
  catalog: typeof gardenAdventureCatalog = gardenAdventureCatalog,
): readonly string[] {
  const errors: string[] = [];
  const narrativeQuestIds = new Set(gardenNarrativeDefinition.quests.map((quest) => quest.id));
  const inventoryItemIds = new Set(gardenGameplayDefinition.items.map((item) => item.id));
  const equipmentSlotIds = new Set(gardenGameplayDefinition.equipmentSlots.map((slot) => slot.id));
  const abilityIds = new Set(gardenGameplayDefinition.abilities.map((ability) => ability.id));
  const encounterIds = new Set(
    gardenGameplayDefinition.encounters.map((encounter) => encounter.id),
  );
  const modelIds = new Set(gardenModelRecords.map((record) => record.id));
  const dialogueIds = new Set(gardenNarrativeDefinition.dialogues.map((dialogue) => dialogue.id));
  const cinematicIds = new Set(gardenEndingTimelineIds);
  const mapKeys = new Set(Object.keys(gardenMaps));
  const mapIds = new Set(Object.values(gardenMaps).map((map) => map.id));
  const npcTargets = gardenTargets.filter(
    (target) =>
      target.kind === 'gardener' || target.kind === 'traveler' || target.kind === 'guardian',
  );
  const npcIds = new Set(npcTargets.map((target) => target.id));
  const writtenFactIds = collectNarrativeWriteKeys(gardenNarrativeDefinition);
  const chapterIds = new Set<string>();
  const chapterByMap = new Map<string, string>();

  const actualModelInstancesByMap = new Map<string, Record<string, number>>(
    [...mapKeys].map((mapId) => [mapId, {}]),
  );
  for (const [instanceId, binding] of Object.entries(GARDEN_MODEL_BINDINGS)) {
    const placement = binding.placement;
    const targetKind = 'targetKind' in placement ? placement.targetKind : undefined;
    const placements =
      placement.kind === 'player'
        ? [...mapKeys].map((mapId) => ({ mapId }))
        : targetKind
          ? gardenTargets.filter((target) => target.kind === targetKind)
          : [];
    const actualMapIds = [...new Set(placements.map((entry) => entry.mapId))].sort();
    if (stableJson(actualMapIds) !== stableJson([...binding.mapIds].sort()))
      errors.push(
        `Model binding ${instanceId} map ownership does not match its actual scene placement.`,
      );
    for (const placementEntry of placements) {
      const counts = actualModelInstancesByMap.get(placementEntry.mapId);
      if (!counts) {
        errors.push(`Model binding ${instanceId} references unknown map ${placementEntry.mapId}.`);
        continue;
      }
      counts[binding.assetId] = (counts[binding.assetId] ?? 0) + 1;
    }
  }

  for (const mapId of mapKeys) {
    const mapPolicy =
      gardenModelBudgetPolicy.maps[mapId as keyof typeof gardenModelBudgetPolicy.maps];
    if (!mapPolicy) errors.push(`Map ${mapId} has no model budget policy.`);
    else if (
      stableJson(actualModelInstancesByMap.get(mapId) ?? {}) !==
      stableJson(mapPolicy.modelInstances)
    )
      errors.push(`Map ${mapId}: model policy counts do not match actual scene placements.`);
  }

  for (const chapter of catalog.chapters) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapter.id) || !chapter.mapIds.length)
      errors.push('Every chapter needs a stable ID and map.');
    if (chapterIds.has(chapter.id)) errors.push(`Duplicate chapter ID ${chapter.id}.`);
    chapterIds.add(chapter.id);

    for (const mapId of chapter.mapIds) {
      if (!mapKeys.has(mapId)) {
        errors.push(`${chapter.id}: unknown map ${mapId}.`);
        continue;
      }
      const existingOwner = chapterByMap.get(mapId);
      if (existingOwner) errors.push(`Map ${mapId} belongs to multiple chapters.`);
      else chapterByMap.set(mapId, chapter.id);
    }

    const chapterLists: readonly (readonly string[])[] = [
      chapter.mapIds,
      chapter.npcIds,
      chapter.dialogueIds,
      chapter.inventoryItemIds,
      chapter.equipmentSlotIds,
      chapter.abilityIds,
      chapter.encounterIds,
      chapter.cinematicIds,
    ];
    for (const values of chapterLists)
      if (new Set(values).size !== values.length)
        errors.push(`${chapter.id}: a catalog reference is listed more than once.`);

    const chainIds = new Set<string>();
    for (const chain of chapter.questChains) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chain.id) || chainIds.has(chain.id))
        errors.push(`${chapter.id}: quest chain IDs must be stable and unique.`);
      chainIds.add(chain.id);
      for (const questId of chain.alternativeQuestIds)
        if (!narrativeQuestIds.has(questId))
          errors.push(`${chapter.id}: unknown quest ${questId}.`);
    }
    for (const dialogueId of chapter.dialogueIds)
      if (!dialogueIds.has(dialogueId))
        errors.push(`${chapter.id}: unknown dialogue ${dialogueId}.`);

    const categories: readonly [string, readonly string[], ReadonlySet<string>][] = [
      ['NPC', chapter.npcIds, npcIds],
      ['inventory item', chapter.inventoryItemIds, inventoryItemIds],
      ['equipment slot', chapter.equipmentSlotIds, equipmentSlotIds],
      ['ability', chapter.abilityIds, abilityIds],
      ['encounter', chapter.encounterIds, encounterIds],
      ['cinematic', chapter.cinematicIds, cinematicIds],
    ] as const;
    for (const [category, ids, validIds] of categories)
      for (const id of ids)
        if (!validIds.has(id)) errors.push(`${chapter.id}: unknown ${category} ${id}.`);

    for (const npcId of chapter.npcIds) {
      const target = npcTargets.find((candidate) => candidate.id === npcId);
      if (target && !chapter.mapIds.includes(target.mapId))
        errors.push(`${chapter.id}: NPC ${npcId} is outside its chapter map ownership.`);
    }
    for (const npc of npcTargets) {
      const owner = chapterByMap.get(npc.mapId);
      if (owner === chapter.id && !chapter.npcIds.includes(npc.id))
        errors.push(`${chapter.id}: NPC ${npc.id} is missing from its owning chapter.`);
    }

    for (const factId of Object.keys(chapter.conditionalSceneObjects))
      if (!writtenFactIds.has(factId))
        errors.push(`${chapter.id}: conditional scene object ${factId} references unknown fact.`);

    const expectedBindings = Object.fromEntries(
      Object.entries(GARDEN_MODEL_BINDINGS)
        .filter(([, binding]) =>
          binding.mapIds.some((mapId) => chapter.mapIds.includes(mapId as GardenMapId)),
        )
        .map(([instanceId, binding]) => [instanceId, binding.assetId]),
    );
    for (const [owner, assetId] of Object.entries(chapter.assetBindings)) {
      const binding = GARDEN_MODEL_BINDINGS[owner as GardenModelInstanceId];
      if (!binding) errors.push(`${chapter.id}: unknown model binding ${owner}.`);
      else {
        if (binding.assetId !== assetId)
          errors.push(`${chapter.id}: asset binding ${owner} does not match its model policy.`);
        if (!modelIds.has(assetId)) errors.push(`${chapter.id}: unknown model ${assetId}.`);
        if (!binding.mapIds.some((mapId) => chapter.mapIds.includes(mapId as GardenMapId)))
          errors.push(`${chapter.id}: asset binding ${owner} is outside chapter map ownership.`);
      }
    }
    if (stableJson(chapter.assetBindings) !== stableJson(expectedBindings))
      errors.push(`${chapter.id}: asset bindings do not match the model policy for its maps.`);
  }

  for (const mapId of mapKeys)
    if (!chapterByMap.has(mapId)) errors.push(`Map ${mapId} has no chapter owner.`);

  const connectionIds = new Set<string>();
  for (const connection of catalog.mapConnections) {
    if (connectionIds.has(connection.id)) errors.push(`Duplicate map connection ${connection.id}.`);
    connectionIds.add(connection.id);
    if (!mapIds.has(connection.fromMap) || !mapIds.has(connection.toMap))
      errors.push(`Map connection ${connection.id} references an unknown map.`);
  }
  return errors;
}
