import { describe, expect, it } from 'vitest';
import { gameReducer } from '../game/reducer.ts';
import { createInitialState } from '../game/initialState.ts';
import type { GameState } from '../game/types.ts';
import { advanceBattlePhase, chooseBattleAction, createBattle, enemyIntentFor } from './battle.ts';
import type { BattleDefinition, BattleState } from './types.ts';

const DEFINITION: BattleDefinition = {
  battleId: 'battle-playful-mouse',
  opponentId: 'npc-playful-mouse',
  hearts: 3,
  maxRounds: 3,
  availableActions: ['action-ball', 'action-shield'],
  enemyIntentPattern: ['rest', 'rest', 'rest'],
};

function hubState(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(), mode: 'hub', resumeMode: 'hub', ...patch };
}

/** Runs one full player round: choose + advance through the passive phases. */
function playRound(battle: BattleState, action: 'action-ball' | 'action-shield'): BattleState {
  let state = chooseBattleAction(battle, action);
  while (state.phase !== 'playerChoice' && state.phase !== 'victory' && state.phase !== 'defeat') {
    state = advanceBattlePhase(state);
  }
  return state;
}

describe('battle rules', () => {
  it('starts at intro with full hearts and the first authored intent', () => {
    const battle = createBattle(DEFINITION);
    expect(battle.phase).toBe('intro');
    expect(battle.round).toBe(1);
    expect(battle.playerHearts).toBe(3);
    expect(battle.opponentHearts).toBe(3);
    expect(battle.enemyIntent).toBe('rest');
  });

  it('cycles the intent pattern per round', () => {
    const mixed: BattleDefinition = { ...DEFINITION, enemyIntentPattern: ['rest', 'attack'] };
    expect(enemyIntentFor(mixed, 1)).toBe('rest');
    expect(enemyIntentFor(mixed, 2)).toBe('attack');
    expect(enemyIntentFor(mixed, 3)).toBe('rest');
    expect(enemyIntentFor(DEFINITION, 4)).toBe('rest');
  });

  it('applies the outcome matrix: rest+ball costs the opponent a heart', () => {
    let battle = advanceBattlePhase(createBattle(DEFINITION));
    battle = chooseBattleAction(battle, 'action-ball');
    expect(battle.lastOutcome).toBe('opponent-hit');
    expect(battle.opponentHearts).toBe(2);
    expect(battle.playerHearts).toBe(3);
  });

  it('attack+shield blocks, attack+ball whiffs, rest+shield does nothing', () => {
    const atChoice: BattleState = { ...createBattle(DEFINITION), phase: 'playerChoice' };

    const blocked = chooseBattleAction({ ...atChoice, enemyIntent: 'attack' }, 'action-shield');
    expect(blocked.lastOutcome).toBe('blocked');
    expect(blocked.opponentHearts).toBe(3);

    const whiffed = chooseBattleAction({ ...atChoice, enemyIntent: 'attack' }, 'action-ball');
    expect(whiffed.lastOutcome).toBe('whiffed');
    expect(whiffed.opponentHearts).toBe(3);

    const nothing = chooseBattleAction({ ...atChoice, enemyIntent: 'rest' }, 'action-shield');
    expect(nothing.lastOutcome).toBe('no-effect');
    expect(nothing.opponentHearts).toBe(3);
  });

  it('rejects actions outside playerChoice and actions the definition does not offer', () => {
    const battle = createBattle(DEFINITION);
    expect(chooseBattleAction(battle, 'action-ball')).toBe(battle);
    const atChoice = advanceBattlePhase(battle);
    const shieldOnly: BattleState = {
      ...atChoice,
      definition: { ...DEFINITION, availableActions: ['action-shield'] },
    };
    expect(chooseBattleAction(shieldOnly, 'action-ball')).toBe(shieldOnly);
  });

  it('playerChoice never auto-advances; victory and defeat are terminal', () => {
    const atChoice = advanceBattlePhase(createBattle(DEFINITION));
    expect(advanceBattlePhase(atChoice)).toBe(atChoice);
    const won: BattleState = { ...atChoice, phase: 'victory' };
    expect(advanceBattlePhase(won)).toBe(won);
    const lost: BattleState = { ...atChoice, phase: 'defeat' };
    expect(advanceBattlePhase(lost)).toBe(lost);
  });

  it('a final-round hit is a victory, never a defeat (hearts beat the round counter)', () => {
    // Last allowed round, last heart: the hit must win outright — the round
    // counter must not override a resolved consequence.
    const finalRound: BattleState = {
      ...advanceBattlePhase(createBattle(DEFINITION)),
      round: 3,
      opponentHearts: 1,
      enemyIntent: 'rest',
    };
    const hit = chooseBattleAction(finalRound, 'action-ball');
    let state = advanceBattlePhase(hit); // playerResolution → enemyResolution
    state = advanceBattlePhase(state); // → roundCheck
    state = advanceBattlePhase(state); // → resolves
    expect(state.phase).toBe('victory');
  });

  it('round-limit expiry without a knockout is the only defeat', () => {
    let battle = advanceBattlePhase(createBattle(DEFINITION));
    battle = playRound(battle, 'action-shield'); // r1: no-effect
    battle = playRound(battle, 'action-shield'); // r2: blocked
    battle = playRound(battle, 'action-shield'); // r3: no-effect → limit
    expect(battle.phase).toBe('defeat');
    expect(battle.opponentHearts).toBe(3);
    expect(battle.playerHearts).toBe(3);
  });
});

describe('game reducer battle boundary', () => {
  it('START_BATTLE creates a session battle in hub mode only', () => {
    const state = hubState();
    const next = gameReducer(state, { type: 'START_BATTLE', definition: DEFINITION });
    expect(next.mode).toBe('hub');
    expect(next.battle?.phase).toBe('intro');
    // Never in dialogue/encounter or while a battle already runs.
    expect(
      gameReducer({ ...state, mode: 'dialogue' }, { type: 'START_BATTLE', definition: DEFINITION })
        .battle,
    ).toBeNull();
    expect(gameReducer(next, { type: 'START_BATTLE', definition: DEFINITION })).toBe(next);
  });

  it('blocked world commands return the same object while a battle is active', () => {
    const battling = gameReducer(hubState(), {
      type: 'START_BATTLE',
      definition: DEFINITION,
    });
    const blocked = [
      { type: 'OPEN_DIALOGUE', npcId: 'npc-neighbour', nodeId: 'neighbour-intro' },
      { type: 'START_QUEST', questId: 'quest-greeting' },
      { type: 'CHANGE_MAP', mapId: 'map-cave', anchorId: 'anchor-cave-mouth' },
      { type: 'DISCOVER', discoveryId: 'discovery-cave-entrance' },
      { type: 'PAUSE' },
      { type: 'SWITCH_PLAYER' },
    ] as const;
    for (const command of blocked) {
      expect(gameReducer(battling, command)).toBe(battling);
    }
  });

  it('LEAVE_BATTLE is the only exit and no-ops without a battle', () => {
    const state = hubState();
    expect(gameReducer(state, { type: 'LEAVE_BATTLE' })).toBe(state);
    const battling = gameReducer(state, { type: 'START_BATTLE', definition: DEFINITION });
    const left = gameReducer(battling, { type: 'LEAVE_BATTLE' });
    expect(left.battle).toBeNull();
    expect(left.mode).toBe('hub');
    expect(left.resumeMode).toBe('hub');
  });

  it('a full deterministic battle can be won through the reducer', () => {
    let state = gameReducer(hubState(), { type: 'START_BATTLE', definition: DEFINITION });
    state = gameReducer(state, { type: 'ADVANCE_BATTLE_PHASE' }); // → playerChoice
    for (let i = 0; i < 3; i += 1) {
      state = gameReducer(state, { type: 'CHOOSE_BATTLE_ACTION', action: 'action-ball' });
      while (state.battle !== null && state.battle.phase !== 'playerChoice') {
        const next = gameReducer(state, { type: 'ADVANCE_BATTLE_PHASE' });
        if (next === state) break;
        state = next;
      }
    }
    expect(state.battle?.phase).toBe('victory');
    expect(state.battle?.opponentHearts).toBe(0);
  });
});
