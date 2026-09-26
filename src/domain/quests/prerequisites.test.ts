import { describe, expect, it } from 'vitest';
import {
  arePrerequisitesMet,
  canStartQuest,
  deriveQuestStatuses,
  nextSuggestedQuest,
} from './prerequisites.ts';
import { createInitialState } from '../game/initialState.ts';
import type { GameState, QuestId } from '../game/types.ts';

function withCompleted(...completed: QuestId[]): GameState {
  const base = createInitialState(0);
  const quests = { ...base.quests };
  for (const id of completed) {
    quests[id] = { status: 'completed', completedSteps: [], completionCount: 1 };
  }
  return { ...base, avatarId: 'avatar-aban', quests };
}

describe('quest prerequisites', () => {
  it('opens only the greeting quest at the start', () => {
    const statuses = deriveQuestStatuses(withCompleted());
    expect(statuses['quest-greeting']).toBe('available');
    expect(statuses['quest-helping']).toBe('locked');
    expect(statuses['quest-tidying']).toBe('locked');
    expect(statuses['quest-finale']).toBe('locked');
  });

  it('unlocks each quest as the previous one completes', () => {
    expect(arePrerequisitesMet(withCompleted('quest-greeting'), 'quest-helping')).toBe(true);
    expect(arePrerequisitesMet(withCompleted('quest-greeting'), 'quest-tidying')).toBe(false);
    expect(
      arePrerequisitesMet(withCompleted('quest-greeting', 'quest-helping'), 'quest-tidying'),
    ).toBe(true);
  });

  it('requires all three quests before the finale', () => {
    const almost = withCompleted('quest-greeting', 'quest-helping');
    expect(canStartQuest(almost, 'quest-finale')).toBe(false);
    const ready = withCompleted('quest-greeting', 'quest-helping', 'quest-tidying');
    expect(canStartQuest(ready, 'quest-finale')).toBe(true);
  });

  it('refuses to start any quest before an avatar is chosen', () => {
    const noAvatar = { ...withCompleted(), avatarId: null };
    expect(canStartQuest(noAvatar, 'quest-greeting')).toBe(false);
  });

  it('keeps completed quests replayable', () => {
    const done = withCompleted('quest-greeting');
    expect(canStartQuest(done, 'quest-greeting')).toBe(true);
    expect(deriveQuestStatuses(done)['quest-greeting']).toBe('completed');
  });

  it('suggests the next quest in order and nothing once finished', () => {
    expect(nextSuggestedQuest(withCompleted())).toBe('quest-greeting');
    expect(nextSuggestedQuest(withCompleted('quest-greeting'))).toBe('quest-helping');
    const all = withCompleted('quest-greeting', 'quest-helping', 'quest-tidying', 'quest-finale');
    expect(nextSuggestedQuest(all)).toBeNull();
  });
});
