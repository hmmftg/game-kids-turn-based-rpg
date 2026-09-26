import type { IconId, LandmarkId, NpcId, QuestId, StickerId } from '../game/types.ts';

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
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'quest-greeting',
    order: 1,
    requires: [],
    landmarkId: 'landmark-home-gate',
    anchorId: 'anchor-home-gate',
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
