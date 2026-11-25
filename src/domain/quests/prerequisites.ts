import type { GameState, QuestId, QuestStatus } from '../game/types.ts';
import { QUEST_DEFINITIONS } from './definitions.ts';
import { getMahalleQuestProgress, MAHALLE_NARRATIVE } from '../game/narrative.ts';
import { getQuestStatus } from 'waypoint-rpg-narrative';

export function arePrerequisitesMet(state: GameState, questId: QuestId): boolean {
  return getQuestStatus(MAHALLE_NARRATIVE, state.narrative, questId) !== 'locked';
}

/** A quest can be entered when its prerequisites are met — completed quests stay replayable. */
export function canStartQuest(state: GameState, questId: QuestId): boolean {
  if (state.avatarId === null) return false;
  const status = getQuestStatus(MAHALLE_NARRATIVE, state.narrative, questId);
  return (
    status === 'available' ||
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'failed'
  );
}

/** Derives the display status of every quest from completion data alone. */
export function deriveQuestStatuses(state: GameState): Record<QuestId, QuestStatus> {
  return Object.fromEntries(
    Object.entries(getMahalleQuestProgress(state.narrative)).map(([questId, progress]) => [
      questId,
      state.encounter?.questId === questId && progress.status !== 'completed'
        ? 'active'
        : progress.status,
    ]),
  ) as Record<QuestId, QuestStatus>;
}

export function nextSuggestedQuest(state: GameState): QuestId | null {
  const ordered = [...QUEST_DEFINITIONS].sort((a, b) => a.order - b.order);
  for (const definition of ordered) {
    if (
      deriveQuestStatuses(state)[definition.id] !== 'completed' &&
      deriveQuestStatuses(state)[definition.id] === 'available'
    ) {
      return definition.id;
    }
  }
  return null;
}
