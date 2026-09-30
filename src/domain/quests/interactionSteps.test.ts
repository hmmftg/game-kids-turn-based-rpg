import { describe, expect, it } from 'vitest';
import { DIALOGUE_NODES } from '../../content/fa/dialogue.ts';
import {
  allDialogueReports,
  allQuestReports,
  dialogueMandatoryActions,
  INTERACTION_LIMITS,
  questMandatoryActions,
  stepMandatoryActions,
} from './interactionSteps.ts';
import { QUEST_DEFINITIONS } from './definitions.ts';

// The ratchet: after the UX overhaul, forced child actions are measured on
// the interaction graph — these tests fail the build on any regression.

describe('interactionSteps — mandatory-action model', () => {
  it('every step forces at most the standard-step limit (1 today)', () => {
    for (const quest of QUEST_DEFINITIONS) {
      for (let index = 0; index < quest.steps.length; index += 1) {
        const actions = stepMandatoryActions(quest.id, index);
        expect(actions, `${quest.id}.steps[${index}]`).toBeLessThanOrEqual(INTERACTION_LIMITS.step);
        expect(actions, `${quest.id}.steps[${index}]`).toBe(1);
      }
    }
  });

  it('a 2-step quest forces 2 child actions + 1 arrival tap', () => {
    const report = questMandatoryActions('quest-school-answer');
    expect(report.steps).toEqual([1, 1]);
    expect(report.total).toBe(3);
  });

  it('every quest report is internally consistent', () => {
    for (const report of allQuestReports()) {
      expect(report.entry).toBe(1);
      expect(report.total).toBe(report.entry + report.steps.reduce((a, b) => a + b, 0));
    }
  });

  it('a routine dialogue forces at most one action on its heaviest path', () => {
    for (const report of allDialogueReports()) {
      expect(report.toComplete, report.nodeId).toBeLessThanOrEqual(INTERACTION_LIMITS.dialogue);
    }
  });

  it('a dialogue with no required choice costs 0 mandatory actions to finish', () => {
    for (const node of DIALOGUE_NODES) {
      if (node.choices === undefined || node.choices.length === 0) {
        // Linear nodes may lead to a choice downstream — the choice itself is
        // the only forced tap; the linear walk costs nothing.
        expect(dialogueMandatoryActions(node.id).toComplete, node.id).toBeLessThanOrEqual(
          INTERACTION_LIMITS.dialogue,
        );
      }
    }
    // teacher-story used to be a 3-line chain + next node — now a single beat.
    expect(dialogueMandatoryActions('teacher-story').toComplete).toBe(0);
  });

  it('the teacher branch forces exactly one pick on its heaviest path', () => {
    expect(dialogueMandatoryActions('teacher-intro').toComplete).toBe(1);
  });

  it('counts required choices, not optional taps', () => {
    // neighbour-intro: 2 optional lines then one required pick.
    expect(dialogueMandatoryActions('neighbour-intro').toComplete).toBe(1);
  });
});
