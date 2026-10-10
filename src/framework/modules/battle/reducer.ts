import { advanceBattlePhase, chooseBattleAction, createBattle } from './battle.ts';
import type { BattleActionId, BattleDefinition, BattleState } from './types.ts';

/**
 * Battle-domain reducer — the integration seam the game reducer delegates to,
 * exactly as it delegates encounters to `domain/quests/encounter.ts`.
 *
 * Operates on `BattleState | null` only; GameState integration (mode guards,
 * blocked commands, resumeMode) stays in `domain/game/reducer.ts`. No-ops
 * return the same object so callers can detect invalid transitions cheaply.
 */
export type BattleCommand =
  | { readonly type: 'START_BATTLE'; readonly definition: BattleDefinition }
  | { readonly type: 'CHOOSE_BATTLE_ACTION'; readonly action: BattleActionId }
  | { readonly type: 'ADVANCE_BATTLE_PHASE' }
  | { readonly type: 'LEAVE_BATTLE' };

export function battleReducer(
  state: BattleState | null,
  command: BattleCommand,
): BattleState | null {
  switch (command.type) {
    case 'START_BATTLE':
      // Starting over an active battle is invalid — leave the current one first.
      if (state !== null) return state;
      return createBattle(command.definition);
    case 'CHOOSE_BATTLE_ACTION': {
      if (state === null) return state;
      return chooseBattleAction(state, command.action);
    }
    case 'ADVANCE_BATTLE_PHASE': {
      if (state === null) return state;
      return advanceBattlePhase(state);
    }
    case 'LEAVE_BATTLE':
      // The only exit — victory/defeat are terminal battle states.
      return null;
  }
}
