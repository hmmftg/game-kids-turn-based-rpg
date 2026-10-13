import { describe, expect, it } from 'vitest';
import {
  advanceBattlePhase,
  battleAchievements,
  chooseBattleAction,
  createBattle,
  enemyIntentFor,
} from './battle.ts';
import { battleReducer } from './reducer.ts';
import { BATTLE_ABILITY_IDS } from './types.ts';
import type {
  BattleActionId,
  BattleDefinition,
  BattleIntent,
  BattleOutcome,
  BattleState,
} from './types.ts';
import { validateBattleDefinition } from './validation.ts';

const DEFINITION: BattleDefinition = {
  battleId: 'battle-playful-mouse',
  opponentId: 'npc-playful-mouse',
  hearts: 3,
  maxRounds: 3,
  availableActions: ['action-ball', 'action-shield'],
  enemyIntentPattern: ['rest', 'rest', 'rest'],
};

/** Runs one full player round: choose + advance through the passive phases. */
function playRound(battle: BattleState, action: BattleActionId): BattleState {
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

  it('weakness costs the opponent one extra heart on an effective action', () => {
    const atChoice: BattleState = { ...createBattle(DEFINITION), phase: 'playerChoice' };
    const ballShy: BattleDefinition = { ...DEFINITION, weakness: 'action-ball' };
    const hit = chooseBattleAction(
      { ...atChoice, definition: ballShy, enemyIntent: 'rest' },
      'action-ball',
    );
    expect(hit.lastOutcome).toBe('opponent-hit');
    expect(hit.opponentHearts).toBe(1); // 3 − 2

    // A feared cushion turns `blocked` into damage: the charge bounces back.
    const cushionShy: BattleDefinition = { ...DEFINITION, weakness: 'action-shield' };
    const blocked = chooseBattleAction(
      { ...atChoice, definition: cushionShy, enemyIntent: 'attack' },
      'action-shield',
    );
    expect(blocked.lastOutcome).toBe('blocked');
    expect(blocked.opponentHearts).toBe(2); // 3 − 1

    // A whiffed weak action still costs nothing.
    const whiffed = chooseBattleAction(
      { ...atChoice, definition: ballShy, enemyIntent: 'attack' },
      'action-ball',
    );
    expect(whiffed.lastOutcome).toBe('whiffed');
    expect(whiffed.opponentHearts).toBe(3);
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

describe('quest abilities', () => {
  /** A definition that already includes two unlocked abilities — the shape
   *  the game reducer produces after merging `offeredAbilities`. */
  const WITH_ABILITIES: BattleDefinition = {
    ...DEFINITION,
    availableActions: [
      'action-ball',
      'action-shield',
      'action-kite',
      'action-shell',
      'action-crystal',
      'action-smile',
      'action-basket',
      'action-leaf',
      'action-friends',
      'action-bread',
      'action-book',
    ],
  };

  function atChoice(definition: BattleDefinition, intent: BattleIntent): BattleState {
    return { ...createBattle(definition), phase: 'playerChoice', enemyIntent: intent };
  }

  it('every action has its own outcome matrix row', () => {
    const cases: [BattleActionId, BattleIntent, BattleOutcome][] = [
      ['action-ball', 'rest', 'opponent-hit'],
      ['action-ball', 'attack', 'whiffed'],
      ['action-shield', 'rest', 'no-effect'],
      ['action-shield', 'attack', 'blocked'],
      ['action-smile', 'rest', 'no-effect'],
      ['action-smile', 'attack', 'opponent-hit'],
      ['action-basket', 'rest', 'opponent-hit'],
      ['action-basket', 'attack', 'blocked'],
      ['action-leaf', 'rest', 'whiffed'],
      ['action-leaf', 'attack', 'blocked'],
      ['action-friends', 'rest', 'opponent-hit'],
      ['action-friends', 'attack', 'whiffed'],
      ['action-kite', 'rest', 'opponent-hit'],
      ['action-kite', 'attack', 'opponent-hit'],
      ['action-shell', 'rest', 'whiffed'],
      ['action-shell', 'attack', 'opponent-hit'],
      ['action-bread', 'rest', 'no-effect'],
      ['action-bread', 'attack', 'blocked'],
      ['action-book', 'rest', 'opponent-hit'],
      ['action-book', 'attack', 'no-effect'],
      ['action-crystal', 'rest', 'opponent-hit'],
      ['action-crystal', 'attack', 'whiffed'],
    ];
    for (const [action, intent, outcome] of cases) {
      const state = chooseBattleAction(atChoice(WITH_ABILITIES, intent), action);
      expect(state.lastOutcome, `${action} vs ${intent}`).toBe(outcome);
    }
  });

  it('the crystal keepsake lands for two hearts', () => {
    const hit = chooseBattleAction(atChoice(WITH_ABILITIES, 'rest'), 'action-crystal');
    expect(hit.lastOutcome).toBe('opponent-hit');
    expect(hit.opponentHearts).toBe(1); // 3 − 2
    // Weak to it and it lands for three.
    const feared: BattleDefinition = { ...WITH_ABILITIES, weakness: 'action-crystal' };
    const fearedHit = chooseBattleAction(
      { ...atChoice(feared, 'rest'), definition: feared },
      'action-crystal',
    );
    expect(fearedHit.opponentHearts).toBe(0);
  });

  it('a pacifying keepsake forces the next intent to rest, once', () => {
    // Pattern says round 2 is an attack — the bread's calm overrides it.
    const attacking: BattleDefinition = {
      ...WITH_ABILITIES,
      enemyIntentPattern: ['rest', 'attack'],
    };
    let battle = advanceBattlePhase(createBattle(attacking));
    battle = chooseBattleAction({ ...battle, enemyIntent: 'attack' }, 'action-bread');
    expect(battle.lastOutcome).toBe('blocked');
    expect(battle.forcedIntent).toBe('rest');
    battle = advanceBattlePhase(battle); // → enemyResolution
    battle = advanceBattlePhase(battle); // → roundCheck
    battle = advanceBattlePhase(battle); // → playerChoice round 2
    expect(battle.enemyIntent).toBe('rest');
    expect(battle.forcedIntent).toBeUndefined();
    // The pattern resumes afterward.
    battle = playRound(battle, 'action-ball');
    expect(battle.round).toBe(3);
    expect(battle.enemyIntent).toBe('rest');
  });

  it('a shrugged-off pacifier calms nobody', () => {
    let battle = advanceBattlePhase(createBattle(WITH_ABILITIES));
    battle = chooseBattleAction(battle, 'action-bread'); // rest → no-effect
    expect(battle.lastOutcome).toBe('no-effect');
    expect(battle.forcedIntent).toBeUndefined();
  });

  it('an ability weakness costs the extra heart only when it lands effectively', () => {
    const feared: BattleDefinition = { ...WITH_ABILITIES, weakness: 'action-kite' };
    const landed = chooseBattleAction(
      { ...atChoice(feared, 'attack'), definition: feared },
      'action-kite',
    );
    expect(landed.opponentHearts).toBe(1); // 3 − 2
    // An ineffective feared action is still harmless.
    const shrugged = chooseBattleAction(
      { ...atChoice(feared, 'rest'), definition: feared },
      'action-shell',
    );
    expect(shrugged.opponentHearts).toBe(3);
  });

  it('abilities not in availableActions are refused', () => {
    const base = advanceBattlePhase(createBattle(DEFINITION));
    expect(chooseBattleAction(base, 'action-kite')).toBe(base);
  });
});

describe('battle reducer', () => {
  it('delegates the state machine over BattleState | null', () => {
    expect(battleReducer(null, { type: 'LEAVE_BATTLE' })).toBeNull();
    expect(battleReducer(null, { type: 'ADVANCE_BATTLE_PHASE' })).toBeNull();
    const started = battleReducer(null, { type: 'START_BATTLE', definition: DEFINITION });
    expect(started?.phase).toBe('intro');
    // Starting over an active battle is a no-op.
    expect(battleReducer(started, { type: 'START_BATTLE', definition: DEFINITION })).toBe(started);
    const advanced = battleReducer(started, { type: 'ADVANCE_BATTLE_PHASE' });
    expect(advanced?.phase).toBe('playerChoice');
    expect(battleReducer(advanced, { type: 'LEAVE_BATTLE' })).toBeNull();
  });
});

describe('battle definition validation', () => {
  it('winnability counts the cyclic intent pattern, not literal entries', () => {
    // [rest, attack] over 6 rounds yields three scorable rest rounds — the
    // validator must reuse the engine's cycling, not count pattern literals.
    const cyclic: BattleDefinition = {
      ...DEFINITION,
      maxRounds: 6,
      enemyIntentPattern: ['rest', 'attack'],
    };
    expect(validateBattleDefinition(cyclic)).toEqual([]);
    // One rest per two rounds over 3 rounds can never take 3 hearts.
    const stretched: BattleDefinition = {
      ...DEFINITION,
      maxRounds: 3,
      enemyIntentPattern: ['rest', 'attack'],
    };
    expect(validateBattleDefinition(stretched).map((issue) => issue.code)).toContain(
      'unwinnable-battle',
    );
  });

  it('weakness must be an offered action, and a feared shield makes attack rounds scorable', () => {
    const notOffered: BattleDefinition = {
      ...DEFINITION,
      availableActions: ['action-ball'],
      weakness: 'action-shield',
    };
    expect(validateBattleDefinition(notOffered).map((issue) => issue.code)).toContain(
      'weakness-not-offered',
    );
    // [attack] × 3 rounds, shield-weak: blocking every charge deals 3 hearts.
    const shieldShy: BattleDefinition = {
      ...DEFINITION,
      hearts: 3,
      maxRounds: 3,
      enemyIntentPattern: ['attack'],
      weakness: 'action-shield',
    };
    expect(validateBattleDefinition(shieldShy)).toEqual([]);
    // Same shape without the weakness is unwinnable — nothing scores.
    const noWeakness: BattleDefinition = {
      ...DEFINITION,
      hearts: 3,
      maxRounds: 3,
      enemyIntentPattern: ['attack'],
    };
    expect(validateBattleDefinition(noWeakness).map((issue) => issue.code)).toContain(
      'unwinnable-battle',
    );
  });

  it('an ability weakness is offerable via offeredAbilities only', () => {
    // An ability the opponent never notices cannot be its weakness.
    const unnoticed: BattleDefinition = { ...DEFINITION, weakness: 'action-kite' };
    expect(validateBattleDefinition(unnoticed).map((issue) => issue.code)).toContain(
      'weakness-not-offered',
    );
    // Noticed via offeredAbilities — offered to the child once unlocked.
    const noticed: BattleDefinition = {
      ...DEFINITION,
      offeredAbilities: ['action-kite'],
      weakness: 'action-kite',
    };
    expect(validateBattleDefinition(noticed)).toEqual([]);
    // A base action is not an ability and cannot hide in offeredAbilities.
    const baseAsAbility: BattleDefinition = {
      ...DEFINITION,
      offeredAbilities: ['action-ball'],
    };
    expect(validateBattleDefinition(baseAsAbility).map((issue) => issue.code)).toContain(
      'offered-not-ability',
    );
    expect(BATTLE_ABILITY_IDS).not.toContain('action-ball');
  });

  it('abilities must not hide in availableActions — the quest gate would vanish', () => {
    const smuggled: BattleDefinition = {
      ...DEFINITION,
      availableActions: [...DEFINITION.availableActions, 'action-kite'],
    };
    expect(validateBattleDefinition(smuggled).map((issue) => issue.code)).toContain(
      'non-base-action',
    );
  });

  it('logs every resolved round and derives session badges off it', () => {
    // Ball-shy mouse: two bonks win, every round effective → all three badges.
    const ballShy: BattleDefinition = { ...DEFINITION, weakness: 'action-ball' };
    let battle = advanceBattlePhase(createBattle(ballShy));
    battle = playRound(battle, 'action-ball');
    battle = playRound(battle, 'action-ball');
    expect(battle.phase).toBe('victory');
    expect(battle.rounds).toEqual([
      { action: 'action-ball', outcome: 'opponent-hit' },
      { action: 'action-ball', outcome: 'opponent-hit' },
    ]);
    expect(battleAchievements(battle)).toEqual(['won', 'found-the-fear', 'steady']);

    // A whiffed round still wins but forfeits `steady`; the landed weak
    // bonks still earn `found-the-fear`. No weakness → no fear badge, and
    // unfinished battles earn nothing.
    const plain: BattleDefinition = {
      ...DEFINITION,
      enemyIntentPattern: ['attack', 'rest', 'rest'],
      weakness: 'action-ball',
    };
    let messy = advanceBattlePhase(createBattle(plain));
    messy = playRound(messy, 'action-ball'); // whiffed
    messy = playRound(messy, 'action-ball'); // weak hit −2
    messy = playRound(messy, 'action-ball'); // weak hit −2 → victory
    expect(messy.phase).toBe('victory');
    expect(battleAchievements(messy)).toEqual(['won', 'found-the-fear']);

    const fearless: BattleDefinition = { ...DEFINITION, hearts: 1, maxRounds: 1 };
    let quick = advanceBattlePhase(createBattle(fearless));
    quick = playRound(quick, 'action-ball');
    expect(quick.phase).toBe('victory');
    expect(battleAchievements(quick)).toEqual(['won', 'steady']);
    expect(battleAchievements(createBattle(DEFINITION))).toEqual([]);
  });
});
