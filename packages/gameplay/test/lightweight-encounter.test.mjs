import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileLightweightEncounter,
  createLightweightEncounter,
  transitionLightweightEncounter,
  validateLightweightEncounter,
} from '../dist/index.js';

function definition(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'friendly-duel',
    opponentId: 'lantern-guardian',
    hearts: 1,
    maxRounds: 3,
    availableActions: ['ball', 'shield'],
    offeredAbilities: ['friends'],
    enemyIntentPattern: ['rest', 'attack'],
    weaknessActionId: 'shield',
    weaknessBonusDamage: 1,
    outcomes: [
      { actionId: 'ball', intentId: 'rest', outcomeId: 'hit', effective: true, opponentDamage: 1 },
      {
        actionId: 'ball',
        intentId: 'attack',
        outcomeId: 'whiff',
        effective: false,
        opponentDamage: 0,
      },
      {
        actionId: 'shield',
        intentId: 'rest',
        outcomeId: 'no-effect',
        effective: false,
        opponentDamage: 0,
      },
      {
        actionId: 'shield',
        intentId: 'attack',
        outcomeId: 'blocked',
        effective: true,
        opponentDamage: 0,
      },
      {
        actionId: 'friends',
        intentId: 'rest',
        outcomeId: 'friendly-hit',
        effective: true,
        opponentDamage: 2,
      },
      {
        actionId: 'friends',
        intentId: 'attack',
        outcomeId: 'friendly-block',
        effective: true,
        opponentDamage: 0,
        forcedNextIntentId: 'rest',
      },
    ],
    ...overrides,
  };
}

function advanceToChoice(state) {
  return transitionLightweightEncounter(state, {
    type: 'advance-phase',
    expectedRevision: state.revision,
  });
}

function finishRound(state) {
  for (let index = 0; index < 3; index += 1) {
    state = transitionLightweightEncounter(state, {
      type: 'advance-phase',
      expectedRevision: state.revision,
    });
  }
  return state;
}

test('validates and compiles generic definitions without mutating authored input', () => {
  const authored = definition();
  const compiled = compileLightweightEncounter(authored);
  authored.outcomes[0].opponentDamage = 99;
  assert.equal(compiled.definition.outcomes[0].opponentDamage, 1);
  assert.equal(Object.isFrozen(compiled.definition.outcomes[0]), true);
  assert.equal(validateLightweightEncounter(definition()).ok, true);
});

test('rejects duplicate identifiers, missing matrix entries and unoffered weaknesses', () => {
  const duplicate = definition({ availableActions: ['ball', 'ball'] });
  assert.ok(
    validateLightweightEncounter(duplicate).diagnostics.some(
      (item) => item.code === 'duplicate-id',
    ),
  );
  const incomplete = definition({ outcomes: definition().outcomes.slice(0, 2) });
  assert.ok(
    validateLightweightEncounter(incomplete).diagnostics.some(
      (item) => item.code === 'incomplete-outcome-matrix',
    ),
  );
  const unoffered = definition({ weaknessActionId: 'unknown' });
  assert.ok(
    validateLightweightEncounter(unoffered).diagnostics.some(
      (item) => item.code === 'weakness-not-offered',
    ),
  );
});

test('rejects accessors, sparse arrays, cycles and forged compiled capabilities safely', () => {
  let accessorCalled = false;
  const accessor = definition();
  Object.defineProperty(accessor, 'id', {
    enumerable: true,
    get() {
      accessorCalled = true;
      throw new Error('must not execute');
    },
  });
  assert.ok(
    validateLightweightEncounter(accessor).diagnostics.some((item) => item.code === 'invalid-json'),
  );
  assert.equal(accessorCalled, false);

  const sparse = definition();
  sparse.availableActions = [];
  sparse.availableActions[1] = 'shield';
  assert.ok(
    validateLightweightEncounter(sparse).diagnostics.some((item) => item.code === 'invalid-json'),
  );

  const cyclic = definition();
  cyclic.outcomes[0].extra = cyclic;
  assert.ok(
    validateLightweightEncounter(cyclic).diagnostics.some((item) => item.code === 'invalid-json'),
  );

  assert.throws(
    () => createLightweightEncounter({ id: 'friendly-duel', definition: definition() }, 'forged'),
    TypeError,
  );
});

test('runs the authored phase sequence and commits a final-round hit as victory', () => {
  const compiled = compileLightweightEncounter(definition({ maxRounds: 1 }));
  let state = createLightweightEncounter(compiled, 'battle-one');
  assert.equal(state.phase, 'intro');
  state = advanceToChoice(state);
  assert.equal(state.phase, 'playerChoice');
  state = transitionLightweightEncounter(state, {
    type: 'choose-action',
    actionId: 'ball',
    expectedRevision: state.revision,
  });
  assert.equal(state.phase, 'playerResolution');
  assert.equal(state.opponentHearts, 0);
  state = finishRound(state);
  assert.equal(state.phase, 'victory');
});

test('filters offered abilities by unlocks, applies weakness bonus and forces the next intent', () => {
  const compiled = compileLightweightEncounter(definition({ hearts: 4, maxRounds: 4 }));
  const locked = createLightweightEncounter(compiled, 'battle-locked');
  assert.equal(
    transitionLightweightEncounter(advanceToChoice(locked), {
      type: 'choose-action',
      actionId: 'friends',
      expectedRevision: 1,
    }).phase,
    'playerChoice',
  );

  let state = createLightweightEncounter(compiled, 'battle-ready', ['friends']);
  state = advanceToChoice(state);
  state = finishRound(
    transitionLightweightEncounter(state, {
      type: 'choose-action',
      actionId: 'ball',
      expectedRevision: state.revision,
    }),
  );
  state = finishRound(
    transitionLightweightEncounter(state, {
      type: 'choose-action',
      actionId: 'friends',
      expectedRevision: state.revision,
    }),
  );
  assert.equal(state.round, 3);
  assert.equal(state.enemyIntent, 'rest');
  assert.equal(state.forcedIntentId, undefined);

  let weak = createLightweightEncounter(
    compileLightweightEncounter(definition({ hearts: 3 })),
    'battle-weak',
  );
  weak = advanceToChoice(weak);
  weak = transitionLightweightEncounter(weak, {
    type: 'choose-action',
    actionId: 'ball',
    expectedRevision: weak.revision,
  });
  weak = finishRound(weak);
  weak = transitionLightweightEncounter(weak, {
    type: 'choose-action',
    actionId: 'shield',
    expectedRevision: weak.revision,
  });
  assert.equal(weak.opponentHearts, 1);
  assert.equal(weak.rounds[1].outcomeId, 'blocked');
});

test('stale, invalid-phase and repeated commands preserve the same immutable state', () => {
  const compiled = compileLightweightEncounter(definition());
  const created = createLightweightEncounter(compiled, 'battle-stale');
  const stale = transitionLightweightEncounter(created, {
    type: 'advance-phase',
    expectedRevision: 1,
  });
  assert.equal(stale, created);
  const atChoice = advanceToChoice(created);
  const invalid = transitionLightweightEncounter(atChoice, {
    type: 'choose-action',
    actionId: 'not-offered',
    expectedRevision: atChoice.revision,
  });
  assert.equal(invalid, atChoice);
  const chosen = transitionLightweightEncounter(atChoice, {
    type: 'choose-action',
    actionId: 'ball',
    expectedRevision: atChoice.revision,
  });
  assert.equal(
    transitionLightweightEncounter(chosen, {
      type: 'choose-action',
      actionId: 'ball',
      expectedRevision: atChoice.revision,
    }),
    chosen,
  );
  assert.notEqual(chosen, atChoice);
});
