import type { BattleActionId } from '../../framework/index.ts';
import type { QuestId, QuestProgress } from '../game/types.ts';
import { QUEST_DEFINITIONS } from './definitions.ts';

/**
 * The battle abilities the child has earned — derived purely from quest
 * completion, so nothing is persisted separately (each quest's
 * `battleAbility` unlocks the moment its status is `completed`). Order is
 * quest order: deterministic, and the strip grows in story order.
 */
export function unlockedBattleActions(
  quests: Readonly<Record<QuestId, QuestProgress>>,
): readonly BattleActionId[] {
  return QUEST_DEFINITIONS.filter((quest) => quests[quest.id]?.status === 'completed').map(
    (quest) => quest.battleAbility,
  );
}
