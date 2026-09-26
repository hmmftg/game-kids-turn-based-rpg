import { describe, expect, it } from 'vitest';
import { advancePhase, applyChoice, createEncounter, isChoiceAccepted } from './encounter.ts';
import { getQuestDefinition } from './definitions.ts';
import { ENCOUNTER_PHASES } from '../game/types.ts';

describe('encounter phase machine', () => {
  it('starts at intro on the first step', () => {
    const encounter = createEncounter('quest-greeting');
    expect(encounter.phase).toBe('intro');
    expect(encounter.stepIndex).toBe(0);
    expect(encounter.retries).toBe(0);
  });

  it('walks intro → demonstrate → playerChoice', () => {
    let encounter = createEncounter('quest-greeting');
    encounter = advancePhase(encounter);
    expect(encounter.phase).toBe('demonstrate');
    encounter = advancePhase(encounter);
    expect(encounter.phase).toBe('playerChoice');
  });

  it('never advances out of playerChoice on its own (no timed dismissal)', () => {
    let encounter = createEncounter('quest-greeting');
    encounter = advancePhase(advancePhase(encounter));
    expect(advancePhase(encounter)).toBe(encounter);
  });

  it('only accepts choices offered by the current step', () => {
    let encounter = createEncounter('quest-greeting');
    encounter = advancePhase(advancePhase(encounter));
    expect(isChoiceAccepted(encounter, 'icon-greet')).toBe(true);
    expect(isChoiceAccepted(encounter, 'icon-wash-hands')).toBe(false);
    expect(applyChoice(encounter, 'icon-wash-hands')).toBe(encounter);
  });

  it('rejects choices made outside the playerChoice phase', () => {
    const encounter = createEncounter('quest-greeting');
    expect(isChoiceAccepted(encounter, 'icon-greet')).toBe(false);
  });

  it('reinforces a correct choice and moves to the next step', () => {
    let encounter = createEncounter('quest-greeting');
    encounter = advancePhase(advancePhase(encounter));
    encounter = applyChoice(encounter, 'icon-greet');
    expect(encounter.phase).toBe('worldResponse');
    expect(encounter.lastChoiceCorrect).toBe(true);
    encounter = advancePhase(encounter);
    expect(encounter.phase).toBe('reinforce');
    encounter = advancePhase(encounter);
    expect(encounter.stepIndex).toBe(1);
    expect(encounter.phase).toBe('intro');
  });

  it('re-demonstrates after a wrong choice and keeps the step', () => {
    let encounter = createEncounter('quest-greeting');
    encounter = advancePhase(advancePhase(encounter));
    encounter = applyChoice(encounter, 'icon-turn-back');
    expect(encounter.lastChoiceCorrect).toBe(false);
    encounter = advancePhase(encounter);
    expect(encounter.phase).toBe('demonstrate');
    expect(encounter.stepIndex).toBe(0);
    expect(encounter.retries).toBe(1);
  });

  it('completes after the final step and is terminal', () => {
    let encounter = createEncounter('quest-greeting');
    const steps = getQuestDefinition('quest-greeting').steps;
    for (const step of steps) {
      encounter = advancePhase(advancePhase(encounter));
      encounter = applyChoice(encounter, step.correctIconId);
      encounter = advancePhase(encounter);
      encounter = advancePhase(encounter);
    }
    expect(encounter.phase).toBe('complete');
    expect(advancePhase(encounter)).toBe(encounter);
  });

  it('keeps every quest within the preschool choice limit of three pictograms', () => {
    for (const questId of [
      'quest-greeting',
      'quest-helping',
      'quest-tidying',
      'quest-finale',
    ] as const) {
      for (const step of getQuestDefinition(questId).steps) {
        expect(step.choiceIconIds.length).toBeGreaterThanOrEqual(2);
        expect(step.choiceIconIds.length).toBeLessThanOrEqual(3);
        expect(step.choiceIconIds).toContain(step.correctIconId);
      }
    }
  });

  it('declares exactly the six documented phases', () => {
    expect([...ENCOUNTER_PHASES]).toEqual([
      'intro',
      'demonstrate',
      'playerChoice',
      'worldResponse',
      'reinforce',
      'complete',
    ]);
  });
});
