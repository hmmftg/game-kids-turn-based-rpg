import assert from 'node:assert/strict';
import { log } from 'node:console';
import {
  applyGameplayGrant,
  compileGameplay,
  compileLightweightEncounter,
  createGameplayState,
  createLightweightEncounter,
  decodeGameplayState,
  encodeGameplayState,
  getCharacterLevel,
  getUnlockedAbilityIds,
  transitionLightweightEncounter,
} from 'waypoint-rpg-gameplay';

const definition = compileGameplay({
  schemaVersion: 1,
  id: 'node-minimum-gameplay',
  contentVersion: 'smoke-1',
  compatibilityVersion: 'smoke-1',
  movementAttributeId: 'movement',
  healthResourceId: 'health',
  inventoryCapacity: 1,
  attributes: [{ id: 'movement', minimum: 1, maximum: 5, defaultValue: 2 }],
  resources: [{ id: 'health', maximum: 10, defaultValue: 10 }],
  progression: {
    maxLevel: 2,
    experienceThresholds: [10],
    abilityUnlocks: [{ level: 2, abilityId: 'focus' }],
  },
  characters: [
    {
      id: 'hero',
      baseAttributes: { movement: 2 },
      startingResources: { health: 10 },
      startingAbilityIds: ['spark'],
    },
  ],
  items: [],
  equipmentSlots: [],
  abilities: [
    {
      id: 'spark',
      resourceCosts: {},
      target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
      effects: [{ op: 'heal', amount: 1 }],
    },
    {
      id: 'focus',
      resourceCosts: {},
      target: { kind: 'self', minimumRange: 0, maximumRange: 0 },
      effects: [{ op: 'heal', amount: 1 }],
    },
  ],
  statusEffects: [],
  boards: [],
  encounters: [],
});

const initial = createGameplayState(definition, 'node-22-minimum-probe');
assert.equal(getCharacterLevel(definition, initial, 'hero'), 1);
const granted = applyGameplayGrant(definition, initial, {
  playthroughId: initial.playthroughId,
  expectedRevision: initial.revision,
  rewardId: 'minimum-probe-xp',
  experience: [{ characterId: 'hero', amount: 10 }],
});
assert.equal(granted.accepted, true);
if (!granted.accepted)
  throw new Error('The installed gameplay package rejected the deterministic grant.');
assert.equal(getCharacterLevel(definition, granted.state, 'hero'), 2);
assert.deepEqual(getUnlockedAbilityIds(definition, granted.state, 'hero'), ['spark', 'focus']);
const restored = decodeGameplayState(
  definition,
  JSON.parse(encodeGameplayState(definition, granted.state)),
);
assert.equal(restored.ok, true);
if (!restored.ok) throw new Error('The gameplay snapshot did not decode.');
assert.equal(restored.state.playthroughId, 'node-22-minimum-probe');

const compiledEncounter = compileLightweightEncounter({
  schemaVersion: 1,
  id: 'minimum-friendly-encounter',
  opponentId: 'lantern-guardian',
  hearts: 1,
  maxRounds: 1,
  availableActions: ['kind-word', 'light'],
  enemyIntentPattern: ['glimmer'],
  weaknessActionId: 'light',
  weaknessBonusDamage: 0,
  outcomes: [
    {
      actionId: 'kind-word',
      intentId: 'glimmer',
      outcomeId: 'friendly-greeting',
      effective: true,
      opponentDamage: 1,
    },
    {
      actionId: 'light',
      intentId: 'glimmer',
      outcomeId: 'share-light',
      effective: true,
      opponentDamage: 1,
    },
  ],
});
let encounter = createLightweightEncounter(compiledEncounter, 'node-22-friendly-encounter');
assert.equal(encounter.phase, 'intro');
const stale = transitionLightweightEncounter(encounter, {
  type: 'advance-phase',
  expectedRevision: encounter.revision + 1,
});
assert.equal(stale, encounter);
encounter = transitionLightweightEncounter(encounter, {
  type: 'advance-phase',
  expectedRevision: encounter.revision,
});
assert.equal(encounter.phase, 'playerChoice');
const rejected = transitionLightweightEncounter(encounter, {
  type: 'choose-action',
  actionId: 'unknown-action',
  expectedRevision: encounter.revision,
});
assert.equal(rejected, encounter);
encounter = transitionLightweightEncounter(encounter, {
  type: 'choose-action',
  actionId: 'light',
  expectedRevision: encounter.revision,
});
assert.equal(encounter.phase, 'playerResolution');
assert.equal(encounter.lastOutcomeId, 'share-light');
assert.equal(encounter.opponentHearts, 0);
for (let index = 0; index < 3; index += 1) {
  encounter = transitionLightweightEncounter(encounter, {
    type: 'advance-phase',
    expectedRevision: encounter.revision,
  });
}
assert.equal(encounter.phase, 'victory');

log('gameplay package native ESM progression, lightweight encounter, and snapshot runtime passed');
