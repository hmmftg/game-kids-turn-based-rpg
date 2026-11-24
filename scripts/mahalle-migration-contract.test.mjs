import assert from 'node:assert/strict';
import {
  advanceMahalleBattlePhase,
  chooseMahalleBattleAction,
  createMahalleBattle,
} from '../src/domain/battle/adapter.ts';
import { authoredBattleOutcomes } from '../src/content/fa/battleOutcomes.ts';
import { gameReducer } from '../src/domain/game/reducer.ts';
import { createInitialState } from '../src/domain/game/initialState.ts';
import { QUEST_DEFINITIONS } from '../src/domain/quests/definitions.ts';
import { getQuestStep } from '../src/domain/quests/definitions.ts';

// Golden compatibility data captured from the pre-migration root game.
const questContract = [
  ['quest-greeting', [], ['greeting-1', 'greeting-2'], 'sticker-greeting', 'action-smile'],
  [
    'quest-helping',
    ['quest-greeting'],
    ['helping-1', 'helping-2'],
    'sticker-helping',
    'action-basket',
  ],
  [
    'quest-tidying',
    ['quest-helping'],
    ['tidying-1', 'tidying-2', 'tidying-3'],
    'sticker-tidying',
    'action-leaf',
  ],
  [
    'quest-finale',
    ['quest-greeting', 'quest-helping', 'quest-tidying'],
    ['finale-1', 'finale-2', 'finale-3'],
    'sticker-finale',
    'action-friends',
  ],
  [
    'quest-park-kite',
    ['quest-finale'],
    ['park-kite-1', 'park-kite-2'],
    'sticker-kite',
    'action-kite',
  ],
  [
    'quest-river-shell',
    ['quest-park-kite'],
    ['river-shell-1', 'river-shell-2', 'river-shell-3'],
    'sticker-shell',
    'action-shell',
  ],
  [
    'quest-bread-errand',
    ['quest-river-shell'],
    ['bread-errand-1', 'bread-errand-2'],
    'sticker-bread',
    'action-bread',
  ],
  [
    'quest-school-answer',
    ['quest-bread-errand'],
    ['school-answer-1', 'school-answer-2'],
    'sticker-school',
    'action-book',
  ],
  [
    'quest-cave-crystal',
    ['quest-school-answer'],
    ['cave-crystal-1', 'cave-crystal-2'],
    'sticker-cave',
    'action-crystal',
  ],
];

const outcomes = {
  rest: {
    'action-ball': 'opponent-hit',
    'action-shield': 'no-effect',
    'action-smile': 'no-effect',
    'action-basket': 'opponent-hit',
    'action-leaf': 'whiffed',
    'action-friends': 'opponent-hit',
    'action-kite': 'opponent-hit',
    'action-shell': 'whiffed',
    'action-bread': 'no-effect',
    'action-book': 'opponent-hit',
    'action-crystal': 'opponent-hit',
  },
  attack: {
    'action-ball': 'whiffed',
    'action-shield': 'blocked',
    'action-smile': 'opponent-hit',
    'action-basket': 'blocked',
    'action-leaf': 'blocked',
    'action-friends': 'whiffed',
    'action-kite': 'opponent-hit',
    'action-shell': 'opponent-hit',
    'action-bread': 'blocked',
    'action-book': 'no-effect',
    'action-crystal': 'whiffed',
  },
};

function check(description, action) {
  action();
  console.log(`ok - ${description}`);
}

check(
  'all stable quest, prerequisite, physical-step, sticker, and ability ids are retained',
  () => {
    assert.deepEqual(
      QUEST_DEFINITIONS.map((quest) => [
        quest.id,
        quest.requires,
        quest.steps.map((step) => step.id),
        quest.stickerId,
        quest.battleAbility,
      ]),
      questContract,
    );
  },
);

function atHub() {
  const now = 1_700_000_000_000;
  let state = gameReducer(
    createInitialState(now),
    { type: 'BOOT_LOADED', persisted: null, health: 'fresh' },
    now,
  );
  state = gameReducer(state, { type: 'START_PRESSED' }, now);
  return gameReducer(state, { type: 'SELECT_AVATAR', avatarId: 'avatar-aban' }, now);
}

function completeQuest(state, questId) {
  let next = gameReducer(state, { type: 'START_QUEST', questId });
  for (let count = 0; next.mode === 'encounter' && count < 100; count += 1) {
    if (next.encounter.phase === 'playerChoice') {
      const step = getQuestStep(next.encounter.questId, next.encounter.stepIndex);
      next = gameReducer(next, { type: 'CHOOSE', iconId: step.correctIconId, correct: true });
    } else {
      next = gameReducer(next, { type: 'ADVANCE_PHASE' });
    }
  }
  assert.notEqual(next.mode, 'encounter', 'the deterministic correct-choice sequence must finish');
  return next;
}

check(
  'wrong choices retry without progress and completed greeting quests remain replayable',
  () => {
    let state = gameReducer(atHub(), { type: 'START_QUEST', questId: 'quest-greeting' });
    state = gameReducer(state, { type: 'ADVANCE_PHASE' });
    state = gameReducer(state, { type: 'ADVANCE_PHASE' });
    const step = getQuestStep('quest-greeting', 0);
    const wrongIcon = step.choiceIconIds.find((iconId) => iconId !== step.correctIconId);
    state = gameReducer(state, { type: 'CHOOSE', iconId: wrongIcon, correct: false });
    assert.equal(state.encounter.lastChoiceCorrect, false);
    assert.deepEqual(state.stickers, []);
    assert.equal(state.quests['quest-greeting'].completionCount, 0);

    const first = completeQuest(atHub(), 'quest-greeting');
    assert.deepEqual(first.quests['quest-greeting'], {
      status: 'completed',
      completedSteps: ['greeting-1', 'greeting-2'],
      completionCount: 1,
    });
    assert.deepEqual(first.stickers, ['sticker-greeting']);
    assert.equal(first.checkpoint.kind, 'questCompleted');

    const replay = completeQuest(first, 'quest-greeting');
    assert.equal(replay.quests['quest-greeting'].completionCount, 2);
    assert.deepEqual(replay.stickers, ['sticker-greeting']);
  },
);

for (const intent of ['rest', 'attack']) {
  check(`the deterministic action outcome matrix against ${intent} intent is retained`, () => {
    for (const [action, expected] of Object.entries(outcomes[intent])) {
      const probeActions = [...new Set([action, 'action-kite'])];
      const probeIntents = intent === 'attack' ? ['attack', 'rest'] : ['rest'];
      const definition = {
        battleId: 'battle-migration-contract',
        opponentId: 'npc-playful-mouse',
        hearts: 4,
        maxRounds: 4,
        availableActions: probeActions,
        enemyIntentPattern: probeIntents,
        weakness: action,
        outcomes: authoredBattleOutcomes(probeActions, probeIntents),
      };
      let ready = createMahalleBattle(definition, []);
      ready = advanceMahalleBattlePhase(ready);
      const resolved = chooseMahalleBattleAction(ready, action);
      assert.equal(resolved.lastOutcomeId, expected, `${intent} + ${action}`);
      const expectedDamage =
        expected === 'opponent-hit'
          ? (action === 'action-crystal' ? 2 : 1) + 1
          : expected === 'blocked'
            ? 1
            : 0;
      assert.equal(
        ready.opponentHearts - resolved.opponentHearts,
        expectedDamage,
        `${intent} + ${action} damage`,
      );
    }
  });
}

check('one-round pacifying intent and the terminal battle phase boundary are retained', () => {
  const definition = {
    battleId: 'battle-migration-pacify',
    opponentId: 'npc-playful-mouse',
    hearts: 2,
    maxRounds: 3,
    availableActions: ['action-ball'],
    offeredAbilities: ['action-friends'],
    enemyIntentPattern: ['rest', 'attack'],
    outcomes: authoredBattleOutcomes(['action-ball', 'action-friends'], ['rest', 'attack']),
  };
  let ready = createMahalleBattle(definition, ['action-friends']);
  ready = advanceMahalleBattlePhase(ready);
  const action = chooseMahalleBattleAction(ready, 'action-friends');
  assert.equal(action.forcedIntentId, 'rest');
  let nextRound = action;
  for (let step = 0; step < 3; step += 1) nextRound = advanceMahalleBattlePhase(nextRound);
  assert.equal(nextRound.phase, 'playerChoice');
  assert.equal(nextRound.round, 2);
  assert.equal(nextRound.enemyIntent, 'rest');
  assert.equal(nextRound.forcedIntentId, undefined);
  const terminal = { ...nextRound, phase: 'victory' };
  assert.strictEqual(advanceMahalleBattlePhase(terminal), terminal);

  const breadDefinition = {
    battleId: 'battle-migration-bread-pacify',
    opponentId: 'npc-playful-mouse',
    hearts: 4,
    maxRounds: 4,
    availableActions: ['action-kite'],
    offeredAbilities: ['action-bread'],
    enemyIntentPattern: ['attack', 'rest', 'attack'],
    outcomes: authoredBattleOutcomes(['action-kite', 'action-bread'], ['attack', 'rest']),
  };
  let bread = createMahalleBattle(breadDefinition, ['action-bread']);
  bread = advanceMahalleBattlePhase(bread);
  bread = chooseMahalleBattleAction(bread, 'action-kite');
  for (let step = 0; step < 3; step += 1) bread = advanceMahalleBattlePhase(bread);
  bread = chooseMahalleBattleAction(bread, 'action-kite');
  for (let step = 0; step < 3; step += 1) bread = advanceMahalleBattlePhase(bread);
  assert.equal(bread.round, 3);
  assert.equal(bread.enemyIntent, 'attack');
  bread = chooseMahalleBattleAction(bread, 'action-bread');
  assert.equal(bread.lastOutcomeId, 'blocked');
  assert.equal(bread.forcedIntentId, 'rest');
  for (let step = 0; step < 3; step += 1) bread = advanceMahalleBattlePhase(bread);
  assert.equal(bread.round, 4);
  assert.equal(bread.enemyIntent, 'rest');
});
