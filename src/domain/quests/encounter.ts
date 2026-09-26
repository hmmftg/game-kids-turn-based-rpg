import type { EncounterState, IconId, QuestId } from '../game/types.ts';
import { getQuestDefinition, getQuestStep } from './definitions.ts';

export function createEncounter(questId: QuestId): EncounterState {
  return {
    questId,
    stepIndex: 0,
    phase: 'intro',
    retries: 0,
    lastChoiceIconId: null,
    lastChoiceCorrect: null,
  };
}

/** The child may only pick during `playerChoice`, and only among the step's icons. */
export function isChoiceAccepted(encounter: EncounterState, iconId: IconId): boolean {
  if (encounter.phase !== 'playerChoice') return false;
  const step = getQuestStep(encounter.questId, encounter.stepIndex);
  return step ? step.choiceIconIds.includes(iconId) : false;
}

export function applyChoice(encounter: EncounterState, iconId: IconId): EncounterState {
  if (!isChoiceAccepted(encounter, iconId)) return encounter;
  const step = getQuestStep(encounter.questId, encounter.stepIndex);
  const correct = step?.correctIconId === iconId;
  return {
    ...encounter,
    phase: 'worldResponse',
    lastChoiceIconId: iconId,
    lastChoiceCorrect: correct,
  };
}

/**
 * Advances the phase machine `intro → demonstrate → playerChoice → worldResponse →
 * reinforce → complete`. A wrong choice loops back to `demonstrate` — there is no
 * failure state, no loss and no blocked progress.
 */
export function advancePhase(encounter: EncounterState): EncounterState {
  switch (encounter.phase) {
    case 'intro':
      return { ...encounter, phase: 'demonstrate' };
    case 'demonstrate':
      return { ...encounter, phase: 'playerChoice' };
    case 'playerChoice':
      // Waiting for the child; time never advances this phase.
      return encounter;
    case 'worldResponse':
      if (encounter.lastChoiceCorrect === true) {
        return { ...encounter, phase: 'reinforce' };
      }
      return {
        ...encounter,
        phase: 'demonstrate',
        retries: encounter.retries + 1,
        lastChoiceIconId: null,
        lastChoiceCorrect: null,
      };
    case 'reinforce': {
      const nextIndex = encounter.stepIndex + 1;
      const hasNextStep = nextIndex < getQuestDefinition(encounter.questId).steps.length;
      if (!hasNextStep) return { ...encounter, phase: 'complete' };
      return {
        ...encounter,
        stepIndex: nextIndex,
        phase: 'intro',
        retries: 0,
        lastChoiceIconId: null,
        lastChoiceCorrect: null,
      };
    }
    case 'complete':
      return encounter;
  }
}

export function isEncounterComplete(encounter: EncounterState): boolean {
  return encounter.phase === 'complete';
}
