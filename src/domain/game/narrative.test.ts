import { describe, expect, it } from 'vitest';
import { DIALOGUE_NODES } from '../../content/fa/dialogue.ts';
import { QUEST_DEFINITIONS } from '../quests/definitions.ts';
import { createFreshPersistedState } from './initialState.ts';
import {
  MAHALLE_NARRATIVE,
  createMahalleNarrativeState,
  getMahalleQuestProgress,
  transitionMahalleNarrative,
} from './narrative.ts';

describe('Mahalle narrative package adapter', () => {
  it('compiles all authored quests and dialogue nodes with stable app IDs', () => {
    expect(MAHALLE_NARRATIVE.definition.quests.map((quest) => quest.id)).toEqual(
      QUEST_DEFINITIONS.map((quest) => quest.id),
    );
    expect(MAHALLE_NARRATIVE.definition.dialogues[0]?.nodes.map((node) => node.id)).toEqual(
      DIALOGUE_NODES.map((node) => node.id),
    );
    for (const quest of QUEST_DEFINITIONS) {
      expect(
        MAHALLE_NARRATIVE.definition.quests.find((entry) => entry.id === quest.id)?.stepIds,
      ).toEqual(quest.steps.map((step) => step.id));
    }
  });

  it('restores legacy quest counts and completed steps without replaying effects', () => {
    const persisted = createFreshPersistedState(1);
    const quests = {
      ...persisted.quests,
      'quest-greeting': {
        status: 'completed' as const,
        completedSteps: ['greeting-1', 'greeting-2'],
        completionCount: 3,
      },
    };
    const state = createMahalleNarrativeState('mahalle-profile-test-1', { ...persisted, quests });
    expect(state.questHistory['quest-greeting']).toEqual({
      completionCount: 3,
      completedSteps: ['greeting-1', 'greeting-2'],
    });
    expect(state.facts).toEqual({});
    expect(getMahalleQuestProgress(state)['quest-greeting']).toEqual({
      status: 'completed',
      completedSteps: ['greeting-1', 'greeting-2'],
      completionCount: 3,
    });
  });

  it('routes repeatable greeting start and completion through atomic library transitions', () => {
    let state = createMahalleNarrativeState('mahalle-pilot-1');
    state = transitionMahalleNarrative(state, {
      type: 'start-quest',
      questId: 'quest-greeting',
    })!;
    expect(getMahalleQuestProgress(state)['quest-greeting'].status).toBe('active');
    state = transitionMahalleNarrative(state, {
      type: 'complete-quest',
      questId: 'quest-greeting',
    })!;
    expect(getMahalleQuestProgress(state)['quest-greeting']).toEqual({
      status: 'completed',
      completedSteps: ['greeting-1', 'greeting-2'],
      completionCount: 1,
    });

    state = transitionMahalleNarrative(state, {
      type: 'start-quest',
      questId: 'quest-greeting',
    })!;
    state = transitionMahalleNarrative(state, {
      type: 'complete-quest',
      questId: 'quest-greeting',
    })!;
    expect(getMahalleQuestProgress(state)['quest-greeting'].completionCount).toBe(2);
  });

  it('opens the NPC-authored cursor and advances branches through package dialogue commands', () => {
    let state = createMahalleNarrativeState('mahalle-dialogue-1');
    state = transitionMahalleNarrative(state, {
      type: 'open-dialogue',
      nodeId: 'neighbour-intro',
    })!;
    expect(state.activeDialogue?.nodeId).toBe('neighbour-intro');
    state = transitionMahalleNarrative(state, {
      type: 'dialogue-target',
      nodeId: 'neighbour-more',
    })!;
    expect(state.activeDialogue?.nodeId).toBe('neighbour-more');
    const rejected = transitionMahalleNarrative(state, {
      type: 'dialogue-target',
      nodeId: 'teacher-play',
    });
    expect(rejected).toBeNull();
    expect(state.activeDialogue?.nodeId).toBe('neighbour-more');
  });
});
