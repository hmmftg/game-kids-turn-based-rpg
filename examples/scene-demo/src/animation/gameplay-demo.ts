import { compileGameplay, createGameplayState, transitionGameplay } from 'waypoint-rpg-gameplay';
import type {
  CompiledGameplay,
  GameplayCommand,
  GameplayState,
  GameplayTransitionResult,
} from 'waypoint-rpg-gameplay';
import type { SemanticAction } from './contracts.js';

export interface AnimationProjectionState {
  readonly [instanceId: string]: { readonly action: SemanticAction; readonly revision: number };
}

/** Advance only the presentation tokens for actions emitted by accepted commands. */
export function applyAnimationProjection(
  previous: AnimationProjectionState,
  changes: Readonly<Record<string, SemanticAction>>,
): AnimationProjectionState {
  const instanceIds = Object.keys(changes);
  if (instanceIds.length === 0) return previous;

  const next = { ...previous };
  for (const instanceId of instanceIds) {
    const action = changes[instanceId];
    if (!action) continue;
    const current = previous[instanceId] ?? { action: 'idle', revision: 0 };
    next[instanceId] = Object.freeze({ action, revision: current.revision + 1 });
  }
  return Object.freeze(next);
}
const PLAYABLE_PARTICIPANT_ID = 'traveler';
const DEMO_ENCOUNTER_INSTANCE = 'phase5-animation-encounter';

const definition = {
  schemaVersion: 1,
  id: 'phase5-animation-demo',
  contentVersion: '1.0.0',
  compatibilityVersion: 'phase5-animation-demo-v1',
  movementAttributeId: 'movement',
  healthResourceId: 'health',
  progression: { maxLevel: 1, experienceThresholds: [] },
  attributes: [
    { id: 'movement', minimum: 1, maximum: 4, defaultValue: 1 },
    { id: 'strength', minimum: 1, maximum: 10, defaultValue: 1 },
  ],
  resources: [{ id: 'health', maximum: 10, defaultValue: 10 }],
  characters: [
    {
      id: 'traveler',
      baseAttributes: { movement: 1, strength: 2 },
      startingAbilityIds: ['light-pulse'],
    },
    { id: 'guardian', baseAttributes: { movement: 1, strength: 2 } },
  ],
  items: [],
  equipmentSlots: [],
  abilities: [
    {
      id: 'light-pulse',
      resourceCosts: {},
      target: { kind: 'enemy', minimumRange: 1, maximumRange: 6 },
      effects: [{ op: 'damage', amount: 10 }],
    },
  ],
  statusEffects: [],
  boards: [{ id: 'animation-board', width: 7, height: 1, blockedCells: [] }],
  encounters: [
    {
      id: 'animation-step',
      boardId: 'animation-board',
      maxTurns: 8,
      allowWithdrawal: false,
      participants: [
        {
          id: PLAYABLE_PARTICIPANT_ID,
          characterId: 'traveler',
          team: 'player',
          position: { x: 0, y: 0 },
          initiative: 10,
        },
        {
          id: 'guardian',
          characterId: 'guardian',
          team: 'enemy',
          position: { x: 6, y: 0 },
          initiative: 1,
        },
      ],
      outcomeMappings: [
        { outcome: 'victory', consequenceId: 'animation-victory' },
        { outcome: 'defeat', consequenceId: 'animation-defeat' },
        { outcome: 'turn-limit', consequenceId: 'animation-turn-limit' },
      ],
    },
  ],
} as const;

export interface AnimationGameplayDemo {
  readonly compiled: CompiledGameplay;
  readonly state: GameplayState;
}

/** Build a small game-owned encounter through the public Phase 4 package API. */
export function createAnimationGameplayDemo(
  playthroughId = 'phase5-animation-playthrough',
): AnimationGameplayDemo {
  const compiled = compileGameplay(definition);
  const initial = createGameplayState(compiled, playthroughId);
  const started = transitionGameplay(compiled, initial, {
    type: 'start-encounter',
    encounterId: 'animation-step',
    instanceId: DEMO_ENCOUNTER_INSTANCE,
    playthroughId,
    expectedRevision: initial.revision,
  });
  if (!started.accepted)
    throw new Error(`Animation demo encounter failed: ${started.reason.code}.`);
  return Object.freeze({ compiled, state: started.state });
}

/** Capture the player's revision when the input is created; never rebase it later. */
export function createAnimationMoveCommand(state: GameplayState): GameplayCommand {
  const encounter = state.encounter;
  const actor = encounter?.combatants.find((combatant) => combatant.id === PLAYABLE_PARTICIPANT_ID);
  if (!encounter || !actor) throw new Error('The animation demo has no active traveler turn.');
  return {
    type: 'move',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
    encounterInstanceId: encounter.instanceId,
    participantId: PLAYABLE_PARTICIPANT_ID,
    destination: { x: actor.position.x + 1, y: actor.position.y },
  };
}

/** Capture a real authored ability intent for the active encounter revision. */
export function createAnimationAbilityCommand(state: GameplayState): GameplayCommand {
  const encounter = state.encounter;
  const actor = encounter?.combatants.find((combatant) => combatant.id === PLAYABLE_PARTICIPANT_ID);
  if (!encounter || !actor) throw new Error('The animation demo has no active traveler turn.');
  return {
    type: 'use-ability',
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
    encounterInstanceId: encounter.instanceId,
    participantId: PLAYABLE_PARTICIPANT_ID,
    abilityId: 'light-pulse',
    targetParticipantId: 'guardian',
  };
}

/** Only a committed public move and state-changed deterministic enemy moves animate. */
export function projectGameplayAnimationChanges(
  previous: GameplayState,
  result: GameplayTransitionResult,
  command: GameplayCommand,
  healthResourceId = 'health',
): Readonly<Record<string, SemanticAction>> {
  if (
    !result.accepted ||
    result.state === previous ||
    result.state.playthroughId !== previous.playthroughId ||
    command.playthroughId !== previous.playthroughId ||
    command.expectedRevision !== previous.revision ||
    !previous.encounter ||
    command.encounterInstanceId !== previous.encounter.instanceId ||
    result.state.encounter?.instanceId !== previous.encounter.instanceId
  )
    return Object.freeze({});

  const changes: Record<string, SemanticAction> = {};
  if (command.type === 'move') {
    const actor = previous.encounter.combatants.find(
      (combatant) => combatant.id === command.participantId,
    );
    if (actor?.team !== 'player' || previous.encounter.activeParticipantId !== actor.id)
      return Object.freeze({});

    for (const next of result.state.encounter.combatants) {
      const before = previous.encounter.combatants.find((combatant) => combatant.id === next.id);
      if (
        before &&
        (before.position.x !== next.position.x || before.position.y !== next.position.y)
      )
        changes[next.id] = 'move';
    }
  } else if (command.type === 'use-ability') {
    const actor = previous.encounter.combatants.find(
      (combatant) => combatant.id === command.participantId,
    );
    if (actor?.team === 'player' && previous.encounter.activeParticipantId === actor.id) {
      changes[actor.id] = 'combat';
      if (result.state.encounter?.outcome === 'victory') {
        for (const next of result.state.encounter.combatants) {
          const before = previous.encounter.combatants.find(
            (combatant) => combatant.id === next.id,
          );
          if (
            before?.team === 'enemy' &&
            (before.resources[healthResourceId] ?? 0) > 0 &&
            (next.resources[healthResourceId] ?? 0) <= 0
          )
            changes[next.id] = 'defeat';
        }
      }
    }
  }
  return Object.freeze(changes);
}
