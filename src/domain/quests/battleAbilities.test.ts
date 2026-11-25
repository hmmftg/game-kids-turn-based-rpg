import { describe, expect, it } from 'vitest';
import { BATTLE_ABILITY_IDS } from '../battle/types.ts';
import { createFreshPersistedState } from '../game/initialState.ts';
import { createMahalleNarrativeState } from '../game/narrative.ts';
import type { PersistedState, QuestId } from '../game/types.ts';
import { unlockedBattleActions } from './battleAbilities.ts';
import { QUEST_DEFINITIONS } from './definitions.ts';

function narrativeWithProgress(
  updates: Partial<Record<QuestId, PersistedState['quests'][QuestId]>>,
) {
  const persisted = createFreshPersistedState();
  const quests = { ...persisted.quests };
  for (const [questId, progress] of Object.entries(updates)) {
    if (progress) quests[questId as QuestId] = progress;
  }
  return createMahalleNarrativeState('ability-tests', { ...persisted, quests });
}

function completedQuests(questIds: readonly QuestId[]) {
  const quests: Partial<Record<QuestId, PersistedState['quests'][QuestId]>> = {};
  for (const questId of questIds) {
    quests[questId] = { status: 'completed', completedSteps: [], completionCount: 1 };
  }
  return narrativeWithProgress(quests);
}

describe('unlockedBattleActions', () => {
  it('grants nothing until a quest completes', () => {
    expect(unlockedBattleActions(createMahalleNarrativeState('ability-tests'))).toEqual([]);
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
    const narrative = narrativeWithProgress({
      'quest-helping': { status: 'active', completedSteps: [], completionCount: 0 },
      'quest-tidying': { status: 'available', completedSteps: [], completionCount: 0 },
    });
    expect(unlockedBattleActions(narrative)).toEqual([]);
  });

  it('every quest grants exactly one ability — together they cover the vocabulary', () => {
    const all = completedQuests(QUEST_DEFINITIONS.map((quest) => quest.id));
    const unlocked = unlockedBattleActions(all);
    expect(new Set(unlocked).size).toBe(QUEST_DEFINITIONS.length);
    expect([...unlocked].sort()).toEqual([...BATTLE_ABILITY_IDS].sort());
  });

  it('retains an earned ability when the repeatable quest starts again', () => {
    const narrative = narrativeWithProgress({
      'quest-helping': { status: 'active', completedSteps: ['helping-1'], completionCount: 1 },
    });
    expect(unlockedBattleActions(narrative)).toContain('action-basket');
  });
});
