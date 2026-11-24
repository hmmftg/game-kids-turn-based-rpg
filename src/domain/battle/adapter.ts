import {
  compileLightweightEncounter,
  createLightweightEncounter,
  transitionLightweightEncounter,
} from 'waypoint-rpg-gameplay';
import type {
  LightweightEncounterCommand,
  LightweightEncounterDefinition,
  LightweightEncounterState,
} from 'waypoint-rpg-gameplay';
import type { BattleActionId, BattleDefinition } from './types.ts';

/** Translate Mahalle-authored content into the generic installed package API. */
export function compileMahalleBattle(definition: BattleDefinition) {
  return compileLightweightEncounter(toGameplayDefinition(definition));
}

export function createMahalleBattle(
  definition: BattleDefinition,
  unlockedAbilities: readonly BattleActionId[],
): LightweightEncounterState {
  return createLightweightEncounter(
    compileMahalleBattle(definition),
    definition.battleId,
    unlockedAbilities,
  );
}

export function chooseMahalleBattleAction(
  state: LightweightEncounterState,
  actionId: BattleActionId,
): LightweightEncounterState {
  return transitionLightweightEncounter(state, {
    type: 'choose-action',
    actionId,
    expectedRevision: state.revision,
  });
}

export function advanceMahalleBattlePhase(
  state: LightweightEncounterState,
): LightweightEncounterState {
  return transitionLightweightEncounter(state, {
    type: 'advance-phase',
    expectedRevision: state.revision,
  });
}

/** Public for package-boundary and differential tests; only data crosses it. */
export function toGameplayDefinition(definition: BattleDefinition): LightweightEncounterDefinition {
  return {
    schemaVersion: 1,
    id: definition.battleId,
    opponentId: definition.opponentId,
    hearts: definition.hearts,
    maxRounds: definition.maxRounds,
    availableActions: definition.availableActions,
    ...(definition.offeredAbilities === undefined
      ? {}
      : { offeredAbilities: definition.offeredAbilities }),
    enemyIntentPattern: definition.enemyIntentPattern,
    ...(definition.weakness === undefined ? {} : { weaknessActionId: definition.weakness }),
    weaknessBonusDamage: 1,
    outcomes: definition.outcomes,
  };
}

export function transitionMahalleBattle(
  state: LightweightEncounterState,
  command: LightweightEncounterCommand,
): LightweightEncounterState {
  return transitionLightweightEncounter(state, command);
}
