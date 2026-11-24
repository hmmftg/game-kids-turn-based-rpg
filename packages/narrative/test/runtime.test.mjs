import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileNarrative,
  createNarrativeState,
  decodeNarrativeState,
  evaluateCondition,
  getDialogueView,
  getFact,
  getQuestStatus,
  transitionNarrative,
} from '../dist/index.js';

function story() {
  return {
    schemaVersion: 1,
    id: 'blood-leaf-demo',
    contentVersion: 'copy-1',
    compatibilityVersion: 'story-structure-1',
    entryDialogueId: 'guardian-dialogue',
    quests: [
      { id: 'clue-quest', restartable: true },
      {
        id: 'lantern-quest',
        prerequisites: { op: 'quest-status', questId: 'clue-quest', status: 'completed' },
      },
    ],
    dialogues: [
      {
        id: 'guardian-dialogue',
        entryNodeId: 'question',
        exitPolicy: 'allowed',
        nodes: [
          {
            id: 'question',
            speakerId: 'guardian',
            text: { fa: 'چه می‌خواهی؟', en: 'What do you seek?' },
            choices: [
              {
                id: 'seek-truth',
                label: { fa: 'حقیقت', en: 'Truth' },
                targetNodeId: 'truth',
                effects: [
                  { op: 'set-flag', key: 'truth', value: true },
                  { op: 'start-quest', questId: 'clue-quest' },
                  { op: 'complete-quest', questId: 'clue-quest' },
                ],
              },
              {
                id: 'seek-vengeance',
                label: { fa: 'انتقام', en: 'Vengeance' },
                targetNodeId: 'vengeance',
                effects: [{ op: 'set-flag', key: 'vengeance', value: true }],
              },
              {
                id: 'repeatable-question',
                label: { fa: 'پرسش دوباره', en: 'Ask again' },
                targetNodeId: 'echo',
                repeatable: true,
                effects: [{ op: 'increment-fact', key: 'trust', amount: 1 }],
              },
              {
                id: 'truth-only',
                label: { fa: 'ادامه‌ی راز', en: 'Reveal the secret' },
                targetNodeId: 'truth',
                when: { op: 'flag', key: 'truth', equals: true },
              },
              {
                id: 'invalid-transaction',
                label: { fa: 'اثر نامعتبر', en: 'Invalid transaction' },
                targetNodeId: 'truth',
                effects: [
                  { op: 'set-flag', key: 'partial', value: true },
                  { op: 'complete-quest', questId: 'lantern-quest' },
                ],
              },
            ],
          },
          {
            id: 'echo',
            speakerId: 'guardian',
            text: { fa: 'دوباره پرسیدی.', en: 'You asked again.' },
            nextNodeId: 'question',
          },
          {
            id: 'truth',
            speakerId: 'guardian',
            text: { fa: 'حقیقت را می‌جویم.', en: 'The truth is revealed.' },
            nextNodeId: 'truth-ending',
          },
          {
            id: 'truth-ending',
            speakerId: 'guardian',
            text: { fa: 'چراغ روشن شد.', en: 'The lantern is lit.' },
            terminal: true,
            endingId: 'ending-truth',
          },
          {
            id: 'vengeance',
            speakerId: 'guardian',
            text: { fa: 'راه دشوار آغاز شد.', en: 'A difficult road begins.' },
            nextNodeId: 'vengeance-ending',
          },
          {
            id: 'vengeance-ending',
            speakerId: 'guardian',
            text: { fa: 'پایان راه انتقام است.', en: 'Vengeance becomes the ending.' },
            terminal: true,
            endingId: 'ending-vengeance',
          },
        ],
      },
      {
        id: 'secret-dialogue',
        entryNodeId: 'secret-dialogue-start',
        when: { op: 'flag', key: 'truth', equals: true },
        exitPolicy: 'forbidden',
        nodes: [
          {
            id: 'secret-dialogue-start',
            speakerId: 'guardian',
            text: { fa: 'راز پیدا شد.', en: 'A secret was found.' },
            terminal: true,
            endingId: 'ending-secret',
          },
        ],
      },
    ],
    triggers: [
      {
        id: 'light-lantern',
        when: { op: 'flag', key: 'truth', equals: true },
        effects: [{ op: 'set-flag', key: 'lantern-lit', value: true }],
      },
    ],
  };
}

function typedStory() {
  return {
    schemaVersion: 1,
    id: 'typed-story',
    contentVersion: 'copy-1',
    compatibilityVersion: 'typed-structure-1',
    defaultLocale: 'fa',
    facts: [
      { key: 'clue-found', type: 'boolean', default: true },
      { key: 'trust', type: 'integer', default: 2 },
      { key: 'approach', type: 'string', default: 'patient' },
    ],
    entryDialogueId: 'guardian-dialogue',
    quests: [],
    dialogues: [
      {
        id: 'guardian-dialogue',
        entryNodeId: 'question',
        exitPolicy: 'allowed',
        nodes: [
          {
            id: 'question',
            speakerId: 'guardian',
            text: {
              fa: 'متن فارسی',
              'fa-IR': 'متن ایران',
              en: 'English text',
            },
            choices: [
              {
                id: 'finish-demo',
                label: { fa: 'پایان', en: 'Finish' },
                targetNodeId: 'terminal',
              },
            ],
          },
          {
            id: 'terminal',
            speakerId: 'guardian',
            text: { fa: 'تمام شد.' },
            terminal: true,
            endingId: 'demo-ending',
          },
        ],
      },
    ],
    triggers: [
      { id: 'clear-flag', effects: [{ op: 'clear-flag', key: 'clue-found' }] },
      { id: 'clear-override', effects: [{ op: 'clear-fact', key: 'clue-found' }] },
      { id: 'set-trust', effects: [{ op: 'set-fact', key: 'trust', value: 9 }] },
      { id: 'reset-trust', effects: [{ op: 'clear-fact', key: 'trust' }] },
    ],
  };
}

function closeableStory() {
  const value = story();
  value.dialogues[0].nodes[0].choices.push({
    id: 'close-with-effect',
    label: { fa: 'بستن گفت‌وگو', en: 'Close the conversation' },
    targetNodeId: 'conversation-closed',
    effects: [{ op: 'set-flag', key: 'closed-effect', value: true }],
  });
  value.dialogues[0].nodes.push({
    id: 'conversation-closed',
    speakerId: 'guardian',
    text: { fa: 'گفت‌وگو به پایان رسید.', en: 'The conversation is complete.' },
    closesDialogue: true,
  });
  return value;
}

function setup() {
  const compiled = compileNarrative(story());
  const state = createNarrativeState(compiled, 'playthrough-one');
  return { compiled, state };
}

function command(state, type, fields = {}) {
  return { type, playthroughId: state.playthroughId, expectedRevision: state.revision, ...fields };
}

function send(compiled, state, type, fields = {}) {
  return transitionNarrative(compiled, state, command(state, type, fields));
}

test('missing-fact semantics distinguish neq from not(eq), with no coercion', () => {
  const { compiled, state } = setup();
  void compiled;
  assert.equal(evaluateCondition({ op: 'eq', key: 'missing', value: 3 }, state), false);
  assert.equal(evaluateCondition({ op: 'neq', key: 'missing', value: 3 }, state), false);
  assert.equal(
    evaluateCondition({ op: 'not', condition: { op: 'eq', key: 'missing', value: 3 } }, state),
    true,
  );
  const withFacts = { ...state, facts: { number: 2, textNumber: '2', fractional: 2.5 } };
  assert.equal(evaluateCondition({ op: 'int-gte', key: 'number', value: 2 }, withFacts), true);
  assert.equal(evaluateCondition({ op: 'int-gte', key: 'textNumber', value: 2 }, withFacts), false);
  assert.equal(evaluateCondition({ op: 'int-gte', key: 'fractional', value: 2 }, withFacts), false);
  assert.equal(evaluateCondition({ op: 'int-gte', key: 'number', value: 2.5 }, state), false);
  assert.equal(evaluateCondition({ op: 'unknown-op' }, state), false);
});

test('typed defaults hydrate without revision changes and declared fact saves are validated', () => {
  const compiled = compileNarrative(typedStory());
  const state = createNarrativeState(compiled, 'typed-playthrough');
  assert.deepEqual(state.facts, { 'clue-found': true, trust: 2, approach: 'patient' });
  assert.equal(state.revision, 0);

  const oldPayload = JSON.parse(JSON.stringify({ ...state, facts: {} }));
  const restored = decodeNarrativeState(compiled, oldPayload);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.state.revision, state.revision);
  assert.deepEqual(restored.state.facts, state.facts);

  assert.equal(decodeNarrativeState(compiled, { ...oldPayload, facts: { trust: '9' } }).ok, false);
  assert.equal(
    decodeNarrativeState(compiled, { ...oldPayload, facts: { unexpected: true } }).ok,
    false,
  );
});

test('locale resolution uses exact locale, base language, then declared default', () => {
  const compiled = compileNarrative(typedStory());
  const state = createNarrativeState(compiled, 'typed-locale-playthrough');
  const opened = transitionNarrative(
    compiled,
    state,
    command(state, 'open-dialogue', { dialogueId: 'guardian-dialogue' }),
  );
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;

  assert.equal(getDialogueView(compiled, opened.state, 'fa-IR')?.text, 'متن ایران');
  assert.equal(getDialogueView(compiled, opened.state, 'fa-AF')?.text, 'متن فارسی');
  assert.equal(getDialogueView(compiled, opened.state, 'en-US')?.text, 'English text');
  assert.equal(getDialogueView(compiled, opened.state, 'tr-TR')?.text, 'متن فارسی');
});

test('clear-flag writes false while clear-fact restores the declared default', () => {
  const compiled = compileNarrative(typedStory());
  let state = createNarrativeState(compiled, 'typed-effects-playthrough');
  const apply = (triggerId) => {
    const result = transitionNarrative(compiled, state, command(state, 'trigger', { triggerId }));
    assert.equal(result.accepted, true);
    if (result.accepted) state = result.state;
  };

  apply('clear-flag');
  assert.equal(getFact(state, 'clue-found'), false);
  apply('clear-override');
  assert.equal(getFact(state, 'clue-found'), true);
  apply('set-trust');
  assert.equal(getFact(state, 'trust'), 9);
  apply('reset-trust');
  assert.equal(getFact(state, 'trust'), 2);
});

test('close-dialogue clears only the conversation cursor and cannot replay its effects', () => {
  const compiled = compileNarrative(closeableStory());
  let state = createNarrativeState(compiled, 'close-playthrough');
  const apply = (type, extra = {}) => {
    const result = transitionNarrative(compiled, state, {
      ...command(state, type),
      ...extra,
    });
    assert.equal(result.accepted, true);
    if (result.accepted) state = result.state;
    return result;
  };

  apply('open-dialogue', { dialogueId: 'guardian-dialogue' });
  apply('choose', { choiceId: 'close-with-effect' });
  assert.equal(getDialogueView(compiled, state, 'fa')?.closeAllowed, true);
  const revisionBeforeClose = state.revision;
  const closed = apply('close-dialogue');
  assert.equal(state.activeDialogue, null);
  assert.equal(state.suspendedDialogue, null);
  assert.equal(state.endingId, null);
  assert.equal(getFact(state, 'closed-effect'), true);
  assert.equal(state.revision, revisionBeforeClose + 1);

  const repeated = transitionNarrative(compiled, state, command(state, 'close-dialogue'));
  assert.equal(repeated.accepted, false);
  if (!repeated.accepted) assert.equal(repeated.state, state);
  assert.equal(closed.accepted, true);
  const reopened = transitionNarrative(
    compiled,
    state,
    command(state, 'open-dialogue', { dialogueId: 'guardian-dialogue' }),
  );
  assert.equal(reopened.accepted, true);
  if (reopened.accepted) {
    assert.equal(
      getDialogueView(compiled, reopened.state, 'fa')?.choices.find(
        (choice) => choice.id === 'close-with-effect',
      )?.available,
      false,
    );
  }
});

test('derived quest availability is queryable but persisted state predicates stay explicit', () => {
  const { compiled, state } = setup();
  assert.equal(getQuestStatus(compiled, state, 'clue-quest'), 'available');
  assert.equal(getQuestStatus(compiled, state, 'lantern-quest'), 'locked');
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const chose = send(compiled, opened.state, 'choose', { choiceId: 'seek-truth' });
  assert.equal(chose.accepted, true);
  if (!chose.accepted) return;
  assert.equal(getQuestStatus(compiled, chose.state, 'clue-quest'), 'completed');
  assert.equal(getQuestStatus(compiled, chose.state, 'lantern-quest'), 'available');
  assert.equal(getFact(chose.state, 'truth'), true);
});

test('rejections preserve durable state identity and do not advance revision', () => {
  const { compiled, state } = setup();
  const noExit = send(compiled, state, 'exit-dialogue');
  const wrongFinish = send(compiled, state, 'finish');
  assert.equal(noExit.accepted, false);
  assert.equal(noExit.accepted ? '' : noExit.reason.code, 'no-active-dialogue');
  assert.equal(wrongFinish.accepted, false);
  assert.equal(wrongFinish.accepted ? '' : wrongFinish.reason.code, 'no-active-dialogue');
  assert.equal(noExit.state, state);
  assert.equal(wrongFinish.state, state);
  assert.equal(state.revision, 0);
  assert.equal(send(compiled, state, 'advance').accepted, false);
  assert.equal(send(compiled, state, 'open-dialogue', { dialogueId: 'missing' }).accepted, false);
});

test('finish on a nonterminal node and advance on a choice-only node reject unchanged', () => {
  const { compiled, state } = setup();
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const finish = send(compiled, opened.state, 'finish');
  const advance = send(compiled, opened.state, 'advance');
  assert.equal(finish.accepted, false);
  assert.equal(finish.accepted ? '' : finish.reason.code, 'not-terminal');
  assert.equal(advance.accepted, false);
  assert.equal(advance.accepted ? '' : advance.reason.code, 'not-linear');
  assert.equal(finish.state, opened.state);
  assert.equal(advance.state, opened.state);
});

test('conditional choices are unavailable to both selectors and direct dispatch', () => {
  const { compiled, state } = setup();
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const view = getDialogueView(compiled, opened.state, 'fa-IR');
  assert.ok(view);
  assert.equal(view.choices.find((choice) => choice.id === 'truth-only').available, false);
  const rejected = send(compiled, opened.state, 'choose', { choiceId: 'truth-only' });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.accepted ? '' : rejected.reason.code, 'choice-unavailable');
  assert.equal(rejected.state, opened.state);
});

test('an effect list applies atomically and accepts start followed by complete', () => {
  const { compiled, state } = setup();
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const rejected = send(compiled, opened.state, 'choose', { choiceId: 'invalid-transaction' });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.accepted ? '' : rejected.reason.code, 'quest-transition');
  assert.equal(rejected.state, opened.state);
  assert.equal(getFact(rejected.state, 'partial'), undefined);

  const valid = send(compiled, opened.state, 'choose', { choiceId: 'seek-truth' });
  assert.equal(valid.accepted, true);
  if (valid.accepted)
    assert.equal(getQuestStatus(compiled, valid.state, 'clue-quest'), 'completed');
});

test('same-revision replay is stale, one-time choices are scoped to a playthrough', () => {
  const { compiled, state } = setup();
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const originalCommand = command(opened.state, 'choose', { choiceId: 'seek-vengeance' });
  const selected = transitionNarrative(compiled, opened.state, originalCommand);
  assert.equal(selected.accepted, true);
  if (!selected.accepted) return;
  const replay = transitionNarrative(compiled, selected.state, originalCommand);
  assert.equal(replay.accepted, false);
  assert.equal(replay.accepted ? '' : replay.reason.code, 'stale-revision');
  assert.equal(replay.state, selected.state);
  const exited = send(compiled, selected.state, 'exit-dialogue');
  assert.equal(exited.accepted, true);
  if (!exited.accepted) return;
  const reopened = send(compiled, exited.state, 'open-dialogue', {
    dialogueId: 'guardian-dialogue',
  });
  assert.equal(reopened.accepted, true);
  if (!reopened.accepted) return;
  assert.equal(getDialogueView(compiled, reopened.state, 'fa').nodeId, 'vengeance');
  const duplicate = send(compiled, reopened.state, 'choose', { choiceId: 'seek-vengeance' });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.accepted ? '' : duplicate.reason.code, 'choice-unavailable');
});

test('leaving and reopening a dialogue resumes its committed branch', () => {
  const { compiled, state } = setup();
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const selected = send(compiled, opened.state, 'choose', { choiceId: 'seek-truth' });
  assert.equal(selected.accepted, true);
  if (!selected.accepted) return;

  const exited = send(compiled, selected.state, 'exit-dialogue');
  assert.equal(exited.accepted, true);
  if (!exited.accepted) return;
  const restored = decodeNarrativeState(compiled, JSON.parse(JSON.stringify(exited.state)));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  const reopened = send(compiled, restored.state, 'open-dialogue', {
    dialogueId: 'guardian-dialogue',
  });
  assert.equal(reopened.accepted, true);
  if (!reopened.accepted) return;

  assert.equal(getDialogueView(compiled, reopened.state, 'fa').nodeId, 'truth');
  assert.deepEqual(reopened.state.appliedChoiceIds, ['seek-truth']);
  assert.equal(reopened.state.revision, exited.state.revision + 1);
});

test('explicitly repeatable choices may apply at later revisions', () => {
  const { compiled, state } = setup();
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const first = send(compiled, opened.state, 'choose', { choiceId: 'repeatable-question' });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const advanced = send(compiled, first.state, 'advance');
  assert.equal(advanced.accepted, true);
  if (!advanced.accepted) return;
  const second = send(compiled, advanced.state, 'choose', { choiceId: 'repeatable-question' });
  assert.equal(second.accepted, true);
  if (second.accepted) {
    assert.equal(getFact(second.state, 'trust'), 2);
    assert.deepEqual(second.state.appliedChoiceIds, ['repeatable-question']);
  }
});

test('trigger effects are condition-checked and one-time within this playthrough', () => {
  const { compiled, state } = setup();
  const blocked = send(compiled, state, 'trigger', { triggerId: 'light-lantern' });
  assert.equal(blocked.accepted, false);
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const truth = send(compiled, opened.state, 'choose', { choiceId: 'seek-truth' });
  assert.equal(truth.accepted, true);
  if (!truth.accepted) return;
  const exit = send(compiled, truth.state, 'exit-dialogue');
  assert.equal(exit.accepted, true);
  if (!exit.accepted) return;
  const lit = send(compiled, exit.state, 'trigger', { triggerId: 'light-lantern' });
  assert.equal(lit.accepted, true);
  if (!lit.accepted) return;
  assert.equal(getFact(lit.state, 'lantern-lit'), true);
  const replay = send(compiled, lit.state, 'trigger', { triggerId: 'light-lantern' });
  assert.equal(replay.accepted, false);
  assert.equal(replay.state, lit.state);
});

test('dialogue exit policy and final ending are enforced by transitions', () => {
  const { compiled, state } = setup();
  const ineligible = send(compiled, state, 'open-dialogue', { dialogueId: 'secret-dialogue' });
  assert.equal(ineligible.accepted, false);
  const eligibleState = Object.freeze({ ...state, facts: Object.freeze({ truth: true }) });
  const secret = send(compiled, eligibleState, 'open-dialogue', { dialogueId: 'secret-dialogue' });
  assert.equal(secret.accepted, true);
  if (secret.accepted) {
    const blockedExit = send(compiled, secret.state, 'exit-dialogue');
    assert.equal(blockedExit.accepted, false);
    assert.equal(blockedExit.accepted ? '' : blockedExit.reason.code, 'exit-forbidden');
    assert.equal(blockedExit.state, secret.state);
  }
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  const exited = send(compiled, opened.state, 'exit-dialogue');
  assert.equal(exited.accepted, true);
  if (!exited.accepted) return;
  const reopened = send(compiled, exited.state, 'open-dialogue', {
    dialogueId: 'guardian-dialogue',
  });
  if (!reopened.accepted) return;
  const truth = send(compiled, reopened.state, 'choose', { choiceId: 'seek-truth' });
  if (!truth.accepted) return;
  const line = send(compiled, truth.state, 'advance');
  if (!line.accepted) return;
  const terminal = send(compiled, line.state, 'advance');
  if (!terminal.accepted) return;
  const finish = send(compiled, terminal.state, 'finish');
  assert.equal(finish.accepted, true);
  if (!finish.accepted) return;
  assert.equal(finish.state.endingId, 'ending-truth');
  const afterEnd = send(compiled, finish.state, 'open-dialogue', {
    dialogueId: 'guardian-dialogue',
  });
  assert.equal(afterEnd.accepted, false);
  assert.equal(afterEnd.accepted ? '' : afterEnd.reason.code, 'ending-final');
});

test('save codec preserves branch state across copy versions and rejects incompatible content', () => {
  const { compiled, state } = setup();
  const opened = send(compiled, state, 'open-dialogue', { dialogueId: 'guardian-dialogue' });
  if (!opened.accepted) assert.fail('dialogue should open');
  const selected = send(compiled, opened.state, 'choose', { choiceId: 'seek-truth' });
  if (!selected.accepted) assert.fail('truth choice should apply');
  const bytesPayload = JSON.parse(JSON.stringify(selected.state));
  const decoded = decodeNarrativeState(compiled, bytesPayload);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.equal(decoded.state.revision, selected.state.revision);
    assert.deepEqual(decoded.state.appliedChoiceIds, selected.state.appliedChoiceIds);
    assert.equal(getFact(decoded.state, 'truth'), true);
  }

  const copyOnly = compileNarrative({ ...story(), contentVersion: 'copy-2' });
  assert.equal(decodeNarrativeState(copyOnly, bytesPayload).ok, true);
  const incompatible = compileNarrative({ ...story(), compatibilityVersion: 'structure-2' });
  const rejected = decodeNarrativeState(incompatible, bytesPayload);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.ok ? '' : rejected.reason, 'incompatible-definition');
  assert.equal(decodeNarrativeState(compiled, { ...bytesPayload, schemaVersion: 99 }).ok, false);
  assert.equal(decodeNarrativeState(compiled, { ...bytesPayload, revision: -1 }).ok, false);
});

function repeatableQuestStory() {
  return {
    schemaVersion: 1,
    id: 'repeatable-quest-story',
    contentVersion: 'copy-1',
    compatibilityVersion: 'repeatable-1',
    facts: [{ key: 'trust', type: 'integer', default: 0 }],
    entryDialogueId: 'entry',
    quests: [
      { id: 'greeting', repeatable: true, stepIds: ['greeting-1', 'greeting-2'] },
      { id: 'one-shot', stepIds: ['one-shot-1'] },
    ],
    dialogues: [
      {
        id: 'entry',
        entryNodeId: 'end',
        exitPolicy: 'allowed',
        nodes: [
          {
            id: 'end',
            speakerId: 'guide',
            text: { en: 'Done.' },
            terminal: true,
            endingId: 'ending',
          },
        ],
      },
    ],
    triggers: [
      {
        id: 'start-greeting',
        repeatable: true,
        effects: [{ op: 'start-quest', questId: 'greeting' }],
      },
      {
        id: 'complete-greeting',
        repeatable: true,
        effects: [{ op: 'complete-quest', questId: 'greeting' }],
      },
      {
        id: 'start-one-shot',
        repeatable: true,
        effects: [{ op: 'start-quest', questId: 'one-shot' }],
      },
      {
        id: 'complete-one-shot',
        repeatable: true,
        effects: [{ op: 'complete-quest', questId: 'one-shot' }],
      },
    ],
  };
}

test('repeatable quests retain stable step history and count each verified completion', () => {
  const compiled = compileNarrative(repeatableQuestStory());
  let state = createNarrativeState(compiled, 'repeatable-playthrough');
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = send(compiled, state, 'trigger', { triggerId: 'start-greeting' });
    assert.equal(started.accepted, true);
    if (!started.accepted) return;
    const completed = send(compiled, started.state, 'trigger', { triggerId: 'complete-greeting' });
    assert.equal(completed.accepted, true);
    if (!completed.accepted) return;
    state = completed.state;
    assert.deepEqual(state.questHistory.greeting, {
      completionCount: attempt,
      completedSteps: ['greeting-1', 'greeting-2'],
    });
    assert.equal(getQuestStatus(compiled, state, 'greeting'), 'completed');
  }
});

test('completed quests without repeatable policy stay terminal and seed restore does not replay effects', () => {
  const compiled = compileNarrative(repeatableQuestStory());
  const state = createNarrativeState(compiled, 'seed-playthrough', {
    facts: { trust: 4 },
    quests: { greeting: 'completed' },
    questHistory: {
      greeting: { completionCount: 2, completedSteps: ['greeting-1', 'greeting-2'] },
    },
  });
  assert.equal(getFact(state, 'trust'), 4);
  assert.equal(getQuestStatus(compiled, state, 'greeting'), 'completed');
  assert.deepEqual(state.questHistory.greeting, {
    completionCount: 2,
    completedSteps: ['greeting-1', 'greeting-2'],
  });

  let oneShot = send(compiled, state, 'trigger', { triggerId: 'start-one-shot' });
  assert.equal(oneShot.accepted, true);
  if (!oneShot.accepted) return;
  oneShot = send(compiled, oneShot.state, 'trigger', { triggerId: 'complete-one-shot' });
  assert.equal(oneShot.accepted, true);
  if (!oneShot.accepted) return;
  const replay = send(compiled, oneShot.state, 'trigger', { triggerId: 'start-one-shot' });
  assert.equal(replay.accepted, false);
  assert.strictEqual(replay.state, oneShot.state);
});

test('snapshot decoder accepts pre-history snapshots and validates authored step history', () => {
  const compiled = compileNarrative(repeatableQuestStory());
  const state = createNarrativeState(compiled, 'decode-playthrough');
  const legacySnapshot = JSON.parse(JSON.stringify(state));
  delete legacySnapshot.questHistory;
  const restored = decodeNarrativeState(compiled, legacySnapshot);
  assert.equal(restored.ok, true);
  if (restored.ok) assert.deepEqual(restored.state.questHistory, {});

  assert.throws(
    () =>
      createNarrativeState(compiled, 'invalid-seed', {
        quests: { greeting: 'completed' },
        questHistory: { greeting: { completionCount: 1, completedSteps: ['unknown-step'] } },
      }),
    /step id/i,
  );
});

test('open-dialogue may start at a known authored node and rejects unknown cursors unchanged', () => {
  const compiled = compileNarrative(story());
  const state = createNarrativeState(compiled, 'targeted-dialogue');
  const opened = send(compiled, state, 'open-dialogue', {
    dialogueId: 'guardian-dialogue',
    startNodeId: 'truth',
  });
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  assert.equal(opened.state.activeDialogue?.nodeId, 'truth');

  const invalid = send(compiled, state, 'open-dialogue', {
    dialogueId: 'guardian-dialogue',
    startNodeId: 'unregistered',
  });
  assert.equal(invalid.accepted, false);
  assert.strictEqual(invalid.state, state);
});
