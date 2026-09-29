import type { IconId, LandmarkId, NpcId, QuestId, StickerId } from '../game/types.ts';
import type { AreaId } from '../world/types.ts';

/**
 * Mechanical quest structure. Child-facing copy lives in `src/content/fa`;
 * this module only references stable content IDs so the copy can be replaced
 * by reviewer-approved text without touching game logic.
 */
export interface EncounterStep {
  readonly id: string;
  readonly npcId: NpcId;
  /** At most three large pictograms per the preschool interaction rules. */
  readonly choiceIconIds: readonly IconId[];
  readonly correctIconId: IconId;
  /** Animation cue played during the `demonstrate` phase. */
  readonly demonstrationCue: string;
}

export interface QuestDefinition {
  readonly id: QuestId;
  readonly order: number;
  readonly requires: readonly QuestId[];
  readonly landmarkId: LandmarkId;
  readonly anchorId: string;
  readonly stickerId: StickerId;
  readonly steps: readonly EncounterStep[];
  /** The world area the quest lives in — quests reference areas, not coordinates. */
  readonly areaId: AreaId;
  /** NPCs this quest's story touches (reusable references, not UI wiring). */
  readonly npcIds: readonly NpcId[];
  /** Dialogue nodes associated with the quest (offer node first). */
  readonly dialogueIds: readonly string[];
  /** Chain links: quests that naturally follow this one. */
  readonly nextQuestIds: readonly QuestId[];
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'quest-greeting',
    order: 1,
    requires: [],
    landmarkId: 'landmark-home-gate',
    anchorId: 'anchor-home-gate',
    areaId: 'area-home',
    npcIds: ['npc-neighbour'],
    dialogueIds: ['neighbour-intro'],
    nextQuestIds: ['quest-helping'],
    stickerId: 'sticker-greeting',
    steps: [
      {
        id: 'greeting-1',
        npcId: 'npc-neighbour',
        choiceIconIds: ['icon-greet', 'icon-wave-away', 'icon-turn-back'],
        correctIconId: 'icon-greet',
        demonstrationCue: 'wave-and-greet',
      },
      {
        id: 'greeting-2',
        npcId: 'npc-neighbour',
        choiceIconIds: ['icon-smile', 'icon-turn-back'],
        correctIconId: 'icon-smile',
        demonstrationCue: 'smile-back',
      },
    ],
  },
  {
    id: 'quest-helping',
    order: 2,
    requires: ['quest-greeting'],
    landmarkId: 'landmark-shop',
    anchorId: 'anchor-shop',
    areaId: 'area-market',
    npcIds: ['npc-shopkeeper'],
    dialogueIds: ['shopkeeper-intro'],
    nextQuestIds: ['quest-tidying'],
    stickerId: 'sticker-helping',
    steps: [
      {
        id: 'helping-1',
        npcId: 'npc-shopkeeper',
        choiceIconIds: ['icon-help-carry', 'icon-watch', 'icon-turn-back'],
        correctIconId: 'icon-help-carry',
        demonstrationCue: 'lift-basket',
      },
      {
        id: 'helping-2',
        npcId: 'npc-shopkeeper',
        choiceIconIds: ['icon-place-basket', 'icon-drop-basket'],
        correctIconId: 'icon-place-basket',
        demonstrationCue: 'place-basket',
      },
    ],
  },
  {
    id: 'quest-tidying',
    order: 3,
    requires: ['quest-helping'],
    landmarkId: 'landmark-garden',
    anchorId: 'anchor-garden',
    areaId: 'area-garden',
    npcIds: ['npc-gardener'],
    dialogueIds: ['gardener-intro'],
    nextQuestIds: ['quest-finale'],
    stickerId: 'sticker-tidying',
    steps: [
      {
        id: 'tidying-1',
        npcId: 'npc-gardener',
        choiceIconIds: ['icon-pick-up', 'icon-kick', 'icon-turn-back'],
        correctIconId: 'icon-pick-up',
        demonstrationCue: 'pick-up-object',
      },
      {
        id: 'tidying-2',
        npcId: 'npc-gardener',
        choiceIconIds: ['icon-basket-bin', 'icon-leave-ground'],
        correctIconId: 'icon-basket-bin',
        demonstrationCue: 'place-in-basket',
      },
      {
        id: 'tidying-3',
        npcId: 'npc-gardener',
        choiceIconIds: ['icon-wash-hands', 'icon-skip'],
        correctIconId: 'icon-wash-hands',
        demonstrationCue: 'wash-hands',
      },
    ],
  },
  {
    id: 'quest-finale',
    order: 4,
    requires: ['quest-greeting', 'quest-helping', 'quest-tidying'],
    landmarkId: 'landmark-square',
    anchorId: 'anchor-square',
    areaId: 'area-town',
    npcIds: ['npc-elder', 'npc-child-friend', 'npc-gardener'],
    dialogueIds: ['elder-intro'],
    nextQuestIds: [],
    stickerId: 'sticker-finale',
    steps: [
      {
        id: 'finale-1',
        npcId: 'npc-elder',
        choiceIconIds: ['icon-greet', 'icon-turn-back'],
        correctIconId: 'icon-greet',
        demonstrationCue: 'wave-and-greet',
      },
      {
        id: 'finale-2',
        npcId: 'npc-child-friend',
        choiceIconIds: ['icon-help-carry', 'icon-watch'],
        correctIconId: 'icon-help-carry',
        demonstrationCue: 'lift-basket',
      },
      {
        id: 'finale-3',
        npcId: 'npc-gardener',
        choiceIconIds: ['icon-pick-up', 'icon-leave-ground'],
        correctIconId: 'icon-pick-up',
        demonstrationCue: 'pick-up-object',
      },
    ],
  },
];

const BY_ID = new Map<QuestId, QuestDefinition>(QUEST_DEFINITIONS.map((q) => [q.id, q]));

export function getQuestDefinition(questId: QuestId): QuestDefinition {
  const definition = BY_ID.get(questId);
  if (!definition) throw new Error(`Unknown quest: ${questId}`);
  return definition;
}

export function getQuestStep(questId: QuestId, stepIndex: number): EncounterStep | null {
  return getQuestDefinition(questId).steps[stepIndex] ?? null;
}

/**
 * The chain a quest belongs to: follow `nextQuestIds` forward and `requires`
 * backward. Longer quest chains are data — adding a quest to a chain never
 * touches UI components.
 */
export function questChain(questId: QuestId): readonly QuestId[] {
  let root = getQuestDefinition(questId);
  while (root.requires.length > 0) {
    root = getQuestDefinition(root.requires[0]!);
  }
  const chain: QuestId[] = [];
  let current: QuestDefinition | undefined = root;
  const seen = new Set<QuestId>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current.id);
    current = current.nextQuestIds[0] ? BY_ID.get(current.nextQuestIds[0]) : undefined;
  }
  return chain;
}
