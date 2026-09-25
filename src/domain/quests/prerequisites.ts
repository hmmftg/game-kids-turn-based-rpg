import type { GameState, QuestId, QuestStatus } from '../game/types.ts';
import { QUEST_DEFINITIONS, getQuestDefinition } from './definitions.ts';

export function arePrerequisitesMet(state: GameState, questId: QuestId): boolean {
  return getQuestDefinition(questId).requires.every(
    (required) => state.quests[required].status === 'completed',
  );
}

/** A quest can be entered when its prerequisites are met — completed quests stay replayable. */
export function canStartQuest(state: GameState, questId: QuestId): boolean {
  if (state.avatarId === null) return false;
  return arePrerequisitesMet(state, questId);
}

/** Derives the display status of every quest from completion data alone. */
export function deriveQuestStatuses(state: GameState): Record<QuestId, QuestStatus> {
  const statuses = {} as Record<QuestId, QuestStatus>;
  for (const definition of QUEST_DEFINITIONS) {
    const progress = state.quests[definition.id];
    if (progress.status === 'completed') {
      statuses[definition.id] = 'completed';
    } else if (state.encounter?.questId === definition.id) {
      statuses[definition.id] = 'active';
    } else {
      statuses[definition.id] = arePrerequisitesMet(state, definition.id) ? 'available' : 'locked';
    }
  }
  return statuses;
}

export function nextSuggestedQuest(state: GameState): QuestId | null {
  const ordered = [...QUEST_DEFINITIONS].sort((a, b) => a.order - b.order);
  for (const definition of ordered) {
    if (
      state.quests[definition.id].status !== 'completed' &&
      arePrerequisitesMet(state, definition.id)
    ) {
      return definition.id;
    }
  }
  return null;
}
