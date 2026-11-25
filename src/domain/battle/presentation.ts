import { BATTLE_DEFINITIONS } from '../../content/fa/battles.ts';
import { isBattleOutcome } from '../../content/fa/battleOutcomes.ts';
import type {
  BattleActionId,
  BattleAchievementId,
  BattleOutcome,
  BattleState,
  BattleView,
} from './types.ts';

/** Adapt package state for the existing child UI; this value is never stored. */
export function getMahalleBattleView(state: BattleState): BattleView | null {
  const authored = BATTLE_DEFINITIONS.find((definition) => definition.battleId === state.battleId);
  if (!authored) return null;
  const lastOutcome: BattleOutcome | null =
    state.lastOutcomeId !== null && isBattleOutcome(state.lastOutcomeId)
      ? state.lastOutcomeId
      : null;
  return {
    engine: state,
    definition: {
      ...authored,
      availableActions: state.definition.availableActions as readonly BattleActionId[],
    },
    battleId: state.battleId,
    opponentId: state.opponentId,
    phase: state.phase,
    round: state.round,
    playerHearts: state.playerHearts,
    opponentHearts: state.opponentHearts,
    enemyIntent: state.enemyIntent as 'rest' | 'attack',
    lastAction: state.lastActionId as BattleActionId | null,
    lastOutcome,
    rounds: state.rounds.map((round) => ({
      action: round.actionId as BattleActionId,
      outcome: round.outcomeId as BattleOutcome,
    })),
  };
}

/** Session-only badges derive from package results and remain app presentation policy. */
export function battleAchievements(state: BattleState): readonly BattleAchievementId[] {
  if (state.phase !== 'victory') return [];
  const badges: BattleAchievementId[] = ['won'];
  const weakness = state.definition.weaknessActionId;
  if (
    weakness !== undefined &&
    state.rounds.some((round) => round.actionId === weakness && round.effective)
  ) {
    badges.push('found-the-fear');
  }
  if (state.rounds.length > 0 && state.rounds.every((round) => round.effective))
    badges.push('steady');
  return badges;
}
