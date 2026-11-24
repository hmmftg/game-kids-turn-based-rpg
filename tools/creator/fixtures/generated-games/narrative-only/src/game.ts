import {
  createNarrativeState,
  decodeNarrativeState,
  transitionNarrative,
  type NarrativeCommand,
  type NarrativeState,
  type NarrativeTransitionResult,
} from 'waypoint-rpg-narrative';
import { compiledStory } from './story';

export const SAVE_KEY = 'generated-narrative-game-save-v1';
const SAVE_VERSION = 1;

export type NarrativeIntent =
  | { readonly type: 'open-dialogue'; readonly dialogueId: string }
  | { readonly type: 'choose'; readonly choiceId: string }
  | { readonly type: 'finish' };

export interface NarrativeSession {
  readonly state: NarrativeState;
  readonly ready: boolean;
  readonly sessionOnly: boolean;
  readonly warning: string | null;
  readonly preservedBytes: string | null;
}

export function createNewSession(playthroughId: string): NarrativeSession {
  return {
    state: createNarrativeState(compiledStory, playthroughId),
    ready: true,
    sessionOnly: false,
    warning: null,
    preservedBytes: null,
  };
}

function recoverySession(raw: string | null, message: string): NarrativeSession {
  return {
    state: createNarrativeState(compiledStory, 'recovery-playthrough'),
    ready: false,
    sessionOnly: true,
    warning: message,
    preservedBytes: raw,
  };
}

export function loadSession(raw: string | null): NarrativeSession {
  if (raw === null) return createNewSession('narrative-playthrough-one');
  try {
    const envelope: unknown = JSON.parse(raw);
    if (
      !isRecord(envelope) ||
      envelope.saveVersion !== SAVE_VERSION ||
      !Object.hasOwn(envelope, 'narrative')
    )
      return recoverySession(raw, 'ذخیره خوانده نشد؛ نسخهٔ تازه فقط در همین پنجره می‌ماند.');
    const decoded = decodeNarrativeState(compiledStory, envelope.narrative);
    if (!decoded.ok)
      return recoverySession(
        raw,
        'ذخیره با این داستان سازگار نیست؛ نسخهٔ تازه فقط در همین پنجره می‌ماند.',
      );
    return {
      state: decoded.state,
      ready: true,
      sessionOnly: false,
      warning: null,
      preservedBytes: null,
    };
  } catch {
    return recoverySession(raw, 'ذخیره آسیب دیده؛ نسخهٔ تازه فقط در همین پنجره می‌ماند.');
  }
}

export function encodeSave(state: NarrativeState): string {
  return JSON.stringify({ saveVersion: SAVE_VERSION, narrative: state });
}

export function dispatchNarrativeIntent(
  state: NarrativeState,
  intent: NarrativeIntent,
): NarrativeTransitionResult {
  const command = {
    ...intent,
    playthroughId: state.playthroughId,
    expectedRevision: state.revision,
  } as NarrativeCommand;
  return transitionNarrative(compiledStory, state, command);
}

export function isNarrativeCommandAccepted(
  result: NarrativeTransitionResult,
): result is Extract<NarrativeTransitionResult, { readonly accepted: true }> {
  return result.accepted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
