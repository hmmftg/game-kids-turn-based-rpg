import type {
  BattleAchievementId,
  BattleActionId,
  BattleDefinition,
  BattleIntent,
  BattleOutcome,
  BattleState,
} from './types.ts';

/**
 * Pure battle rules — the deterministic half of the toy.
 *
 * Outcome matrix (fixed before visuals, per contract):
 *
 *   | enemy intent | action-ball      | action-shield      |
 *   | ------------ | ---------------- | ------------------ |
 *   | rest         | opponent −1 heart | no effect          |
 *   | attack       | ball whiffs       | shield blocks      |
 *
 * Weakness (W7): the authored `weakness` action costs the opponent one
 * extra heart when it produces an effect — a feared ball hits for −2 on a
 * rest, a feared cushion turns `blocked` into −1 on an attack.
 *
 * No counter-damage to the child, no crits, no randomness, no punitive
 * failure — defeat only when the round limit expires.
 */

/** The opponent's committed intent for a 1-based round — cycles the authored pattern. */
export function enemyIntentFor(definition: BattleDefinition, round: number): BattleIntent {
  const pattern = definition.enemyIntentPattern;
  return pattern[(round - 1) % pattern.length] ?? 'rest';
}

export function createBattle(definition: BattleDefinition): BattleState {
  return {
    definition,
    battleId: definition.battleId,
    opponentId: definition.opponentId,
    phase: 'intro',
    round: 1,
    playerHearts: definition.hearts,
    opponentHearts: definition.hearts,
    enemyIntent: enemyIntentFor(definition, 1),
    lastAction: null,
    lastOutcome: null,
    rounds: [],
  };
}

function resolveOutcome(intent: BattleIntent, action: BattleActionId): BattleOutcome {
  if (intent === 'rest') return action === 'action-ball' ? 'opponent-hit' : 'no-effect';
  return action === 'action-shield' ? 'blocked' : 'whiffed';
}

/**
 * Hearts the action costs the opponent this round — the outcome matrix plus
 * the authored weakness: an effective weak-to action deals one extra heart
 * (`opponent-hit` 2, `blocked` 1); a whiff or a shrug always costs nothing.
 */
export function damageFor(
  outcome: BattleOutcome,
  action: BattleActionId,
  weakness: BattleActionId | undefined,
): number {
  const weak = action === weakness;
  if (outcome === 'opponent-hit') return weak ? 2 : 1;
  if (outcome === 'blocked') return weak ? 1 : 0;
  return 0;
}

/**
 * The most hearts any offered action can cost the opponent in one round —
 * the validator's winnability primitive: best outcome over every offered
 * action against the round's intent, weakness included.
 */
export function damagePotential(definition: BattleDefinition, round: number): number {
  const intent = enemyIntentFor(definition, round);
  let best = 0;
  for (const action of definition.availableActions) {
    best = Math.max(best, damageFor(resolveOutcome(intent, action), action, definition.weakness));
  }
  return best;
}

/**
 * The child's one action this round. Only valid in `playerChoice` and only for
 * actions the definition offers — anything else returns the same object so
 * callers can detect the no-op.
 */
export function chooseBattleAction(state: BattleState, action: BattleActionId): BattleState {
  if (state.phase !== 'playerChoice') return state;
  if (!state.definition.availableActions.includes(action)) return state;
  const outcome = resolveOutcome(state.enemyIntent, action);
  const damage = damageFor(outcome, action, state.definition.weakness);
  return {
    ...state,
    phase: 'playerResolution',
    lastAction: action,
    lastOutcome: outcome,
    opponentHearts: Math.max(0, state.opponentHearts - damage),
    rounds: [...state.rounds, { action, outcome }],
  };
}

/**
 * Session-only badges a finished battle earns (W7b) — presentation derived
 * from the round log, never persisted:
 * - `won`: the battle ended in victory.
 * - `found-the-fear`: the feared action produced an effect at least once.
 * - `steady`: victory where every round produced an effect — no whiffs, no
 *   shrugged-off cushions.
 */
export function battleAchievements(state: BattleState): readonly BattleAchievementId[] {
  const badges: BattleAchievementId[] = [];
  if (state.phase !== 'victory') return badges;
  badges.push('won');
  const fear = state.definition.weakness;
  if (
    fear !== undefined &&
    state.rounds.some(
      (round) =>
        round.action === fear && (round.outcome === 'opponent-hit' || round.outcome === 'blocked'),
    )
  ) {
    badges.push('found-the-fear');
  }
  if (
    state.rounds.length > 0 &&
    state.rounds.every((round) => round.outcome === 'opponent-hit' || round.outcome === 'blocked')
  ) {
    badges.push('steady');
  }
  return badges;
}

/**
 * Auto-advance through the machine. `playerChoice` waits (returns same
 * object); `victory`/`defeat` are terminal (return same object — leaving is
 * `LEAVE_BATTLE` on the game reducer, not a phase).
 *
 * `roundCheck` precedence is explicit: a resolved consequence wins over the
 * round counter, so a successful ball on the final round is a victory, never
 * a defeat.
 */
export function advanceBattlePhase(state: BattleState): BattleState {
  const definition = state.definition;
  switch (state.phase) {
    case 'intro':
      return { ...state, phase: 'playerChoice' };
    case 'playerResolution':
      return { ...state, phase: 'enemyResolution' };
    case 'enemyResolution':
      return { ...state, phase: 'roundCheck' };
    case 'roundCheck': {
      if (state.opponentHearts <= 0) return { ...state, phase: 'victory' };
      if (state.round >= definition.maxRounds) return { ...state, phase: 'defeat' };
      const round = state.round + 1;
      return {
        ...state,
        phase: 'playerChoice',
        round,
        enemyIntent: enemyIntentFor(definition, round),
        lastAction: null,
        lastOutcome: null,
      };
    }
    case 'playerChoice':
    case 'victory':
    case 'defeat':
      return state;
  }
}
