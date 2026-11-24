import type { LightweightEncounterOutcomeDefinition } from 'waypoint-rpg-gameplay';
import type { BattleActionId, BattleIntent, BattleOutcome } from '../../domain/battle/types.ts';

type OutcomeData = Omit<LightweightEncounterOutcomeDefinition, 'actionId' | 'intentId'>;

/**
 * Mahalle's authored physical-action policy. The gameplay package receives
 * these rows as data and owns only validation and state transitions.
 */
const OUTCOME_MATRIX: Readonly<
  Record<BattleActionId, Readonly<Record<BattleIntent, OutcomeData>>>
> = {
  'action-ball': {
    rest: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 1 },
    attack: { outcomeId: 'whiffed', effective: false, opponentDamage: 0 },
  },
  'action-shield': {
    rest: { outcomeId: 'no-effect', effective: false, opponentDamage: 0 },
    attack: { outcomeId: 'blocked', effective: true, opponentDamage: 0 },
  },
  'action-smile': {
    rest: { outcomeId: 'no-effect', effective: false, opponentDamage: 0 },
    attack: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 1 },
  },
  'action-basket': {
    rest: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 1 },
    attack: { outcomeId: 'blocked', effective: true, opponentDamage: 0 },
  },
  'action-leaf': {
    rest: { outcomeId: 'whiffed', effective: false, opponentDamage: 0 },
    attack: { outcomeId: 'blocked', effective: true, opponentDamage: 0 },
  },
  'action-friends': {
    rest: {
      outcomeId: 'opponent-hit',
      effective: true,
      opponentDamage: 1,
      forcedNextIntentId: 'rest',
    },
    attack: { outcomeId: 'whiffed', effective: false, opponentDamage: 0 },
  },
  'action-kite': {
    rest: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 1 },
    attack: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 1 },
  },
  'action-shell': {
    rest: { outcomeId: 'whiffed', effective: false, opponentDamage: 0 },
    attack: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 1 },
  },
  'action-bread': {
    rest: { outcomeId: 'no-effect', effective: false, opponentDamage: 0 },
    attack: {
      outcomeId: 'blocked',
      effective: true,
      opponentDamage: 0,
      forcedNextIntentId: 'rest',
    },
  },
  'action-book': {
    rest: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 1 },
    attack: { outcomeId: 'no-effect', effective: false, opponentDamage: 0 },
  },
  'action-crystal': {
    rest: { outcomeId: 'opponent-hit', effective: true, opponentDamage: 2 },
    attack: { outcomeId: 'whiffed', effective: false, opponentDamage: 0 },
  },
};

export function authoredBattleOutcomes(
  actions: readonly BattleActionId[],
  intents: readonly BattleIntent[] = ['rest', 'attack'],
): readonly LightweightEncounterOutcomeDefinition[] {
  return actions.flatMap((actionId) =>
    [...new Set(intents)].map((intentId) => {
      const row = OUTCOME_MATRIX[actionId][intentId];
      return {
        actionId,
        intentId,
        ...row,
      };
    }),
  );
}

export function isBattleOutcome(value: string): value is BattleOutcome {
  return (
    value === 'opponent-hit' || value === 'blocked' || value === 'whiffed' || value === 'no-effect'
  );
}
