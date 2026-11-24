import type { NarrativeState } from 'waypoint-rpg-narrative';
import type { BattleActionId } from '../battle/types.ts';
import { QUEST_DEFINITIONS } from './definitions.ts';

/**
 * The battle abilities the child has earned — derived purely from quest
 * completion history, so nothing is persisted separately. A repeatable quest
 * remains unlocked after its next attempt starts because its history belongs
 * to the narrative package. Order is deterministic quest order.
 */
export function unlockedBattleActions(narrative: NarrativeState): readonly BattleActionId[] {
  return QUEST_DEFINITIONS.filter(
    (quest) => (narrative.questHistory[quest.id]?.completionCount ?? 0) > 0,
  ).map((quest) => quest.battleAbility);
}
