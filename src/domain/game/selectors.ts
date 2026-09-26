import { getQuestDefinition, getQuestStep, QUEST_DEFINITIONS } from '../quests/definitions.ts';
import type { EncounterStep } from '../quests/definitions.ts';
import { deriveQuestStatuses } from '../quests/prerequisites.ts';
import { isStableMode } from './checkpoints.ts';
import type { GameState, QuestId, QuestStatus } from './types.ts';

export function selectQuestStatuses(state: GameState): Record<QuestId, QuestStatus> {
  return deriveQuestStatuses(state);
}

export function selectCurrentStep(state: GameState): EncounterStep | null {
  if (!state.encounter) return null;
  return getQuestStep(state.encounter.questId, state.encounter.stepIndex);
}

export function selectCompletedQuestCount(state: GameState): number {
  return QUEST_DEFINITIONS.filter((q) => state.quests[q.id].status === 'completed').length;
}

export function selectProgressRatio(state: GameState): number {
  return selectCompletedQuestCount(state) / QUEST_DEFINITIONS.length;
}

export function selectIsGameFinished(state: GameState): boolean {
  return state.quests['quest-finale'].status === 'completed';
}

export function selectStickerCount(state: GameState): number {
  return state.stickers.length;
}

export function selectQuestStickerId(questId: QuestId): string {
  return getQuestDefinition(questId).stickerId;
}

/**
 * Autosave is only allowed from a stable mode, after a stable transition, and
 * never over a `recovered` save: a corrupt or newer-version payload stays
 * untouched until the parent confirms a reset.
 */
export function shouldAutosave(previous: GameState, next: GameState): boolean {
  return (
    next.autosaveToken !== previous.autosaveToken &&
    isStableMode(next.mode) &&
    next.saveHealth !== 'recovered'
  );
}

export function selectIsOverlayOpen(state: GameState): boolean {
  return state.mode === 'paused' || state.mode === 'parentGate' || state.mode === 'parentArea';
}

/** World interaction is disabled while overlays or non-hub modes are active. */
export function selectIsWorldInteractive(state: GameState): boolean {
  return state.mode === 'hub' && state.webglAvailable && state.orientation === 'landscape';
}
