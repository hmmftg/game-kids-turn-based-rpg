import { describe, expect, it } from 'vitest';
import { getBattleDefinition } from '../../content/fa/battles.ts';
import {
  advanceMahalleBattlePhase,
  chooseMahalleBattleAction,
  createMahalleBattle,
} from './adapter.ts';
import { battleAchievements } from './presentation.ts';

const BIRD = getBattleDefinition('battle-challenge-bird')!;

function winWithKite() {
  let state = createMahalleBattle(BIRD, ['action-kite']);
  state = advanceMahalleBattlePhase(state);
  state = chooseMahalleBattleAction(state, 'action-kite');
  for (let index = 0; index < 3; index += 1) state = advanceMahalleBattlePhase(state);
  return state;
}

function winAfterAnIneffectiveRound() {
  let state = createMahalleBattle(BIRD, ['action-kite']);
  state = advanceMahalleBattlePhase(state);
  state = chooseMahalleBattleAction(state, 'action-ball');
  for (let index = 0; index < 3; index += 1) state = advanceMahalleBattlePhase(state);
  state = chooseMahalleBattleAction(state, 'action-ball');
  for (let index = 0; index < 3; index += 1) state = advanceMahalleBattlePhase(state);
  state = chooseMahalleBattleAction(state, 'action-kite');
  for (let index = 0; index < 3; index += 1) state = advanceMahalleBattlePhase(state);
  return state;
}

describe('Mahalle battle achievement projection', () => {
  it('keeps session badges empty until the package commits victory', () => {
    const started = createMahalleBattle(BIRD, ['action-kite']);
    const choosing = advanceMahalleBattlePhase(started);
    const resolving = chooseMahalleBattleAction(choosing, 'action-kite');

    expect(started.phase).toBe('intro');
    expect(resolving.phase).toBe('playerResolution');
    expect(battleAchievements(started)).toEqual([]);
    expect(battleAchievements(resolving)).toEqual([]);
  });

  it('projects won, feared-ability, and steady badges from package round results', () => {
    const won = winWithKite();

    expect(won.phase).toBe('victory');
    expect(won.rounds).toEqual([
      {
        actionId: 'action-kite',
        intentId: 'rest',
        outcomeId: 'opponent-hit',
        effective: true,
        opponentDamage: 2,
      },
    ]);
    expect(battleAchievements(won)).toEqual(['won', 'found-the-fear', 'steady']);
  });

  it('does not award the feared-ability or steady badge for ineffective rounds', () => {
    const won = winAfterAnIneffectiveRound();

    expect(won.phase).toBe('victory');
    expect(won.rounds.map((round) => round.effective)).toEqual([true, false, true]);
    expect(battleAchievements(won)).toEqual(['won', 'found-the-fear']);
  });

  it('does not award victory badges for a loss', () => {
    const defeated = { ...winWithKite(), phase: 'defeat' as const };

    expect(battleAchievements(defeated)).toEqual([]);
  });
});
