import {
  applyGameplayGrant,
  createGameplayState,
  decodeGameplayState,
  encodeGameplayState,
  getUnlockedAbilityIds,
  transitionGameplay,
  type GameplayCommand,
  type GameplayPlayerIntent,
  type GameplayState,
  type GameplayTransitionResult,
} from 'waypoint-rpg-gameplay';
import { compiledGameplay } from './gameplay';

export const SAVE_KEY = 'generated-tactical-game-save-v1';
const SAVE_VERSION = 1;

export interface TacticalSession {
  readonly state: GameplayState;
  readonly ready: boolean;
  readonly sessionOnly: boolean;
  readonly warning: string | null;
  readonly preservedBytes: string | null;
}

export function createNewSession(playthroughId: string): TacticalSession {
  let state = createGameplayState(compiledGameplay, playthroughId);
  const starter = applyGameplayGrant(compiledGameplay, state, {
    playthroughId,
    expectedRevision: state.revision,
    rewardId: `starter-kit:${playthroughId}`,
    items: [{ itemId: 'ember-charm', quantity: 1 }],
    equipment: [{ characterId: 'traveler', itemId: 'ember-charm', slotId: 'charm' }],
  });
  if (!starter.accepted)
    throw new Error(`Starter equipment was rejected: ${starter.reason.message}`);
  state = starter.state;
  return {
    state,
    ready: true,
    sessionOnly: false,
    warning: null,
    preservedBytes: null,
  };
}

function recoverySession(raw: string, message: string): TacticalSession {
  return {
    state: createNewSession('recovery-tactical-playthrough').state,
    ready: false,
    sessionOnly: true,
    warning: message,
    preservedBytes: raw,
  };
}

export function loadSession(raw: string | null): TacticalSession {
  if (raw === null) return createNewSession('tactical-playthrough-one');
  try {
    const envelope: unknown = JSON.parse(raw);
    if (
      !isRecord(envelope) ||
      envelope.saveVersion !== SAVE_VERSION ||
      !Object.hasOwn(envelope, 'gameplay')
    )
      return recoverySession(raw, 'Save could not be read; this run stays in this browser tab.');
    const decoded = decodeGameplayState(compiledGameplay, envelope.gameplay);
    if (!decoded.ok)
      return recoverySession(raw, 'Save is incompatible; this run stays in this browser tab.');
    return {
      state: decoded.state,
      ready: true,
      sessionOnly: false,
      warning: null,
      preservedBytes: null,
    };
  } catch {
    return recoverySession(raw, 'Save is damaged; this run stays in this browser tab.');
  }
}

export function encodeSave(state: GameplayState): string {
  const canonical = encodeGameplayState(compiledGameplay, state);
  return JSON.stringify({ saveVersion: SAVE_VERSION, gameplay: JSON.parse(canonical) });
}

export function dispatchGameplayIntent(
  state: GameplayState,
  intent: GameplayPlayerIntent,
): GameplayTransitionResult {
  const command = {
    ...intent,
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
    ...(intent.type !== 'start-encounter' && state.encounter
      ? { encounterInstanceId: state.encounter.instanceId }
      : {}),
  } as GameplayCommand;
  return transitionGameplay(compiledGameplay, state, command);
}

export function startPracticeEncounter(state: GameplayState): GameplayTransitionResult {
  return dispatchGameplayIntent(state, {
    type: 'start-encounter',
    encounterId: 'practice-duel',
    instanceId: `duel-${state.playthroughId}`,
  });
}

export function unlockedAbilities(state: GameplayState): readonly string[] {
  return getUnlockedAbilityIds(compiledGameplay, state, 'traveler');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
