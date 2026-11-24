import assert from 'node:assert/strict';
import {
  advanceBattlePhase,
  chooseBattleAction,
  createBattle,
  damageFor,
} from '../src/framework/index.ts';
import { QUEST_DEFINITIONS } from '../src/domain/quests/definitions.ts';

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

for (const intent of ['rest', 'attack']) {
  check(`the deterministic action outcome matrix against ${intent} intent is retained`, () => {
    for (const [action, expected] of Object.entries(outcomes[intent])) {
      const definition = {
        battleId: 'battle-migration-contract',
        opponentId: 'npc-playful-mouse',
        hearts: 3,
        maxRounds: 2,
        availableActions: [action],
        enemyIntentPattern: [intent],
        weakness: action,
      };
      const ready = advanceBattlePhase(createBattle(definition));
      const resolved = chooseBattleAction(ready, action);
      assert.equal(resolved.lastOutcome, expected, `${intent} + ${action}`);
      const baseDamage = expected === 'opponent-hit' ? (action === 'action-crystal' ? 2 : 1) : 0;
      const expectedDamage =
        expected === 'opponent-hit' ? baseDamage + 1 : expected === 'blocked' ? 1 : 0;
      assert.equal(
        damageFor(expected, action, action),
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
    hearts: 4,
    maxRounds: 3,
    availableActions: ['action-friends'],
    enemyIntentPattern: ['rest', 'attack'],
  };
  const ready = advanceBattlePhase(createBattle(definition));
  const action = chooseBattleAction(ready, 'action-friends');
  assert.equal(action.forcedIntent, 'rest');
  const nextRound = advanceBattlePhase(advanceBattlePhase(advanceBattlePhase(action)));
  assert.equal(nextRound.phase, 'playerChoice');
  assert.equal(nextRound.round, 2);
  assert.equal(nextRound.enemyIntent, 'rest');
  assert.equal(nextRound.forcedIntent, undefined);
  const terminal = { ...nextRound, phase: 'victory' };
  assert.strictEqual(advanceBattlePhase(terminal), terminal);
});
