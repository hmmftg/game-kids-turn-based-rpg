import { describe, expect, it } from 'vitest';
import { BATTLE_ABILITY_IDS } from '../../framework/index.ts';
import { createEmptyQuests } from '../game/initialState.ts';
import type { QuestId } from '../game/types.ts';
import { unlockedBattleActions } from './battleAbilities.ts';
import { QUEST_DEFINITIONS } from './definitions.ts';

function completedQuests(questIds: readonly QuestId[]) {
  const quests = createEmptyQuests();
  const next = { ...quests };
  for (const questId of questIds) {
    next[questId] = { status: 'completed', completedSteps: [], completionCount: 1 };
  }
  return next;
}

describe('unlockedBattleActions', () => {
  it('grants nothing until a quest completes', () => {
    expect(unlockedBattleActions(createEmptyQuests())).toEqual([]);
  });

  it('grants each completed quest its ability, in quest order', () => {
    const unlocked = unlockedBattleActions(
      completedQuests(['quest-river-shell', 'quest-greeting']),
    );
    // greeting (order 1) sorts before river-shell (order 6) regardless of
    // the input order — the strip grows in story order.
    expect(unlocked).toEqual(['action-smile', 'action-shell']);
  });

  it('ignores non-completed statuses', () => {
    const quests = createEmptyQuests();
    quests['quest-helping'] = { status: 'active', completedSteps: [], completionCount: 0 };
    quests['quest-tidying'] = { status: 'available', completedSteps: [], completionCount: 0 };
    expect(unlockedBattleActions(quests)).toEqual([]);
  });

  it('every quest grants exactly one ability — together they cover the vocabulary', () => {
    const all = completedQuests(QUEST_DEFINITIONS.map((quest) => quest.id));
    const unlocked = unlockedBattleActions(all);
    expect(new Set(unlocked).size).toBe(QUEST_DEFINITIONS.length);
    expect([...unlocked].sort()).toEqual([...BATTLE_ABILITY_IDS].sort());
  });
});
