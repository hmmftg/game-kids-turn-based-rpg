import { describe, expect, it } from 'vitest';
import { gameReducer } from './reducer.ts';
import { createInitialState } from './initialState.ts';
import type { GameState, QuestId } from './types.ts';
import type { BattleDefinition } from '../../framework/index.ts';

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

function withCompletedQuests(state: GameState, questIds: readonly QuestId[]): GameState {
  const quests = { ...state.quests };
  for (const questId of questIds) {
    quests[questId] = { status: 'completed', completedSteps: [], completionCount: 1 };
  }
  return { ...state, quests };
}

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

describe('quest-granted battle abilities', () => {
  const MOUSE: BattleDefinition = {
    ...DEFINITION,
    offeredAbilities: ['action-basket', 'action-book'],
    weakness: 'action-basket',
  };

  it('unlocked abilities the opponent offers join the action strip', () => {
    // quest-helping grants the basket; quest-school-answer grants the book.
    const state = withCompletedQuests(hubState(), ['quest-helping', 'quest-school-answer']);
    const next = gameReducer(state, { type: 'START_BATTLE', definition: MOUSE });
    expect(next.battle?.definition.availableActions).toEqual([
      'action-ball',
      'action-shield',
      'action-basket',
      'action-book',
    ]);
  });

  it('locked abilities stay off the strip', () => {
    const next = gameReducer(hubState(), { type: 'START_BATTLE', definition: MOUSE });
    expect(next.battle?.definition.availableActions).toEqual(['action-ball', 'action-shield']);
    // Identical definition object when nothing is earned — no enrichment.
    expect(next.battle?.definition).toBe(MOUSE);
  });

  it('an ability the opponent does not offer stays locked away', () => {
    // quest-park-kite grants the kite, which the mouse never notices.
    const state = withCompletedQuests(hubState(), ['quest-park-kite']);
    const next = gameReducer(state, { type: 'START_BATTLE', definition: MOUSE });
    expect(next.battle?.definition.availableActions).toEqual(['action-ball', 'action-shield']);
  });

  it('a feared ability costs the extra heart once it lands', () => {
    const state = withCompletedQuests(hubState(), ['quest-helping']);
    let next = gameReducer(state, { type: 'START_BATTLE', definition: MOUSE });
    next = gameReducer(next, { type: 'ADVANCE_BATTLE_PHASE' }); // → playerChoice
    next = gameReducer(next, { type: 'CHOOSE_BATTLE_ACTION', action: 'action-basket' });
    expect(next.battle?.lastOutcome).toBe('opponent-hit');
    expect(next.battle?.opponentHearts).toBe(1); // 3 − 2
  });
});

describe('LEAVE_BATTLE discovery recording', () => {
  const FACT_DEFINITION: BattleDefinition = {
    ...DEFINITION,
    victoryDiscoveryId: 'discovery-challenge-bird',
  };

  /** Drives a started battle to victory and back to hub via LEAVE_BATTLE. */
  function winAndLeave(definition: BattleDefinition, from: GameState): GameState {
    let state = gameReducer(from, { type: 'START_BATTLE', definition });
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
    return gameReducer(state, { type: 'LEAVE_BATTLE' });
  }

  it('victory + fact absent → appended to discoveries', () => {
    const left = winAndLeave(FACT_DEFINITION, hubState());
    expect(left.battle).toBeNull();
    expect(left.mode).toBe('hub');
    expect(left.discoveries).toContain('discovery-challenge-bird');
  });

  it('victory + fact already present → no duplicate', () => {
    const first = winAndLeave(FACT_DEFINITION, hubState());
    const second = winAndLeave(FACT_DEFINITION, first);
    expect(second.discoveries.filter((d) => d === 'discovery-challenge-bird')).toHaveLength(1);
  });

  it('victory without victoryDiscoveryId → stable leave, records nothing', () => {
    const before = hubState().discoveries;
    const left = winAndLeave(DEFINITION, hubState());
    expect(left.battle).toBeNull();
    expect(left.discoveries).toEqual(before);
  });

  it('defeat → battle clears and nothing is recorded', () => {
    // Shield every round: never scores, round limit expires → defeat.
    let state = gameReducer(hubState(), { type: 'START_BATTLE', definition: FACT_DEFINITION });
    state = gameReducer(state, { type: 'ADVANCE_BATTLE_PHASE' });
    for (let i = 0; i < 3; i += 1) {
      state = gameReducer(state, { type: 'CHOOSE_BATTLE_ACTION', action: 'action-shield' });
      while (state.battle !== null && state.battle.phase !== 'playerChoice') {
        const next = gameReducer(state, { type: 'ADVANCE_BATTLE_PHASE' });
        if (next === state) break;
        state = next;
      }
    }
    expect(state.battle?.phase).toBe('defeat');
    const left = gameReducer(state, { type: 'LEAVE_BATTLE' });
    expect(left.battle).toBeNull();
    expect(left.discoveries).not.toContain('discovery-challenge-bird');
  });

  it('leaving mid-battle records nothing', () => {
    let state = gameReducer(hubState(), { type: 'START_BATTLE', definition: FACT_DEFINITION });
    state = gameReducer(state, { type: 'ADVANCE_BATTLE_PHASE' });
    const left = gameReducer(state, { type: 'LEAVE_BATTLE' });
    expect(left.battle).toBeNull();
    expect(left.discoveries).not.toContain('discovery-challenge-bird');
  });
});
