import assert from 'node:assert/strict';
import { log } from 'node:console';
import {
  compileNarrative,
  createNarrativeState,
  decodeNarrativeState,
  getQuestStatus,
  transitionNarrative,
} from 'waypoint-rpg-narrative';

const definition = compileNarrative({
  schemaVersion: 1,
  id: 'minimum-node-story',
  contentVersion: 'copy-1',
  compatibilityVersion: 'shape-1',
  defaultLocale: 'fa',
  facts: [{ key: 'clue-found', type: 'boolean', default: false }],
  entryDialogueId: 'intro',
  quests: [{ id: 'garden-task', repeatable: true, stepIds: ['plant-seed'] }],
  dialogues: [
    {
      id: 'intro',
      entryNodeId: 'question',
      exitPolicy: 'forbidden',
      nodes: [
        {
          id: 'question',
          speakerId: 'guide',
          text: { fa: 'سرنخ را پیدا کردی؟' },
          choices: [
            {
              id: 'find-clue',
              label: { fa: 'بله' },
              targetNodeId: 'ending',
              effects: [{ op: 'set-flag', key: 'clue-found', value: true }],
            },
          ],
        },
        {
          id: 'ending',
          speakerId: 'guide',
          text: { fa: 'پایان' },
          terminal: true,
          endingId: 'story-complete',
        },
      ],
    },
  ],
  triggers: [
    {
      id: 'start-garden-task',
      repeatable: true,
      effects: [{ op: 'start-quest', questId: 'garden-task' }],
    },
    {
      id: 'complete-garden-task',
      repeatable: true,
      effects: [{ op: 'complete-quest', questId: 'garden-task' }],
    },
  ],
});

const initial = createNarrativeState(definition, 'node-22-minimum-probe');
const opened = transitionNarrative(definition, initial, {
  type: 'open-dialogue',
  dialogueId: 'intro',
  playthroughId: initial.playthroughId,
  expectedRevision: initial.revision,
});
assert.equal(opened.accepted, true);
if (!opened.accepted) throw new Error('The installed narrative package rejected dialogue open.');
const chosen = transitionNarrative(definition, opened.state, {
  type: 'choose',
  choiceId: 'find-clue',
  playthroughId: initial.playthroughId,
  expectedRevision: opened.state.revision,
});
assert.equal(chosen.accepted, true);
if (!chosen.accepted)
  throw new Error('The installed narrative package rejected the authored choice.');
assert.equal(chosen.state.facts['clue-found'], true);
const finished = transitionNarrative(definition, chosen.state, {
  type: 'finish',
  playthroughId: initial.playthroughId,
  expectedRevision: chosen.state.revision,
});
assert.equal(finished.accepted, true);
if (!finished.accepted) throw new Error('The installed narrative package rejected the ending.');
assert.equal(finished.state.endingId, 'story-complete');

let questState = createNarrativeState(definition, 'node-22-repeatable-probe');
for (let completionCount = 1; completionCount <= 2; completionCount += 1) {
  const started = transitionNarrative(definition, questState, {
    type: 'trigger',
    triggerId: 'start-garden-task',
    playthroughId: questState.playthroughId,
    expectedRevision: questState.revision,
  });
  assert.equal(started.accepted, true);
  if (!started.accepted) throw new Error('The installed narrative package rejected quest start.');
  assert.equal(getQuestStatus(definition, started.state, 'garden-task'), 'active');
  const completed = transitionNarrative(definition, started.state, {
    type: 'trigger',
    triggerId: 'complete-garden-task',
    playthroughId: started.state.playthroughId,
    expectedRevision: started.state.revision,
  });
  assert.equal(completed.accepted, true);
  if (!completed.accepted)
    throw new Error('The installed narrative package rejected quest completion.');
  questState = completed.state;
  assert.equal(getQuestStatus(definition, questState, 'garden-task'), 'completed');
  assert.deepEqual(questState.questHistory['garden-task'], {
    completionCount,
    completedSteps: ['plant-seed'],
  });
}
const restored = decodeNarrativeState(definition, JSON.parse(JSON.stringify(questState)));
assert.equal(restored.ok, true);
if (!restored.ok)
  throw new Error('The installed narrative package rejected repeatable quest history.');
assert.deepEqual(restored.state.questHistory['garden-task'], {
  completionCount: 2,
  completedSteps: ['plant-seed'],
});

log('narrative package native ESM dialogue, repeatable quest, and snapshot runtime passed');
