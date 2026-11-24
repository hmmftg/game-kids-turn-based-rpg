/** Game-neutral mechanics for deterministic, one-action-per-round 1v1 encounters. */

import { validateJsonTree } from './validate.js';
import type { GameplayDiagnostic } from './definition.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const MAX_BUDGET = 1_000_000;
const COMPILED = new WeakSet<object>();

export interface LightweightEncounterOutcomeDefinition {
  readonly actionId: string;
  readonly intentId: string;
  readonly outcomeId: string;
  /** Whether this result counts as an effective action for weakness rules. */
  readonly effective: boolean;
  readonly opponentDamage: number;
  /** Optional deterministic intent override for the next round. */
  readonly forcedNextIntentId?: string;
}

export interface LightweightEncounterDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly opponentId: string;
  readonly hearts: number;
  readonly maxRounds: number;
  /** Always available physical actions for this encounter. */
  readonly availableActions: readonly string[];
  /** Optional actions that the application may add after its own unlock check. */
  readonly offeredAbilities?: readonly string[];
  readonly enemyIntentPattern: readonly string[];
  readonly weaknessActionId?: string;
  readonly weaknessBonusDamage?: number;
  readonly outcomes: readonly LightweightEncounterOutcomeDefinition[];
}

export interface LightweightEncounterDiagnostic {
  readonly severity: 'error';
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface LightweightEncounterValidationReport {
  readonly diagnostics: readonly LightweightEncounterDiagnostic[];
  readonly ok: boolean;
}

export interface CompiledLightweightEncounter {
  readonly id: string;
  readonly definition: LightweightEncounterDefinition;
}

export type LightweightEncounterPhase =
  | 'intro'
  | 'playerChoice'
  | 'playerResolution'
  | 'enemyResolution'
  | 'roundCheck'
  | 'victory'
  | 'defeat';

export interface LightweightEncounterRound {
  readonly actionId: string;
  readonly intentId: string;
  readonly outcomeId: string;
  readonly effective: boolean;
  readonly opponentDamage: number;
}

export interface LightweightEncounterState {
  readonly definition: LightweightEncounterDefinition;
  readonly battleId: string;
  readonly opponentId: string;
  readonly phase: LightweightEncounterPhase;
  readonly revision: number;
  readonly round: number;
  readonly playerHearts: number;
  readonly opponentHearts: number;
  readonly enemyIntent: string;
  readonly lastActionId: string | null;
  readonly lastOutcomeId: string | null;
  readonly forcedIntentId?: string | undefined;
  readonly rounds: readonly LightweightEncounterRound[];
}

export type LightweightEncounterCommand =
  | {
      readonly type: 'choose-action';
      readonly actionId: string;
      readonly expectedRevision: number;
    }
  | { readonly type: 'advance-phase'; readonly expectedRevision: number };

export class LightweightEncounterDefinitionError extends Error {
  readonly diagnostics: readonly LightweightEncounterDiagnostic[];

  constructor(diagnostics: readonly LightweightEncounterDiagnostic[]) {
    super(`Invalid lightweight encounter definition (${diagnostics.length} errors).`);
    this.name = 'LightweightEncounterDefinitionError';
    this.diagnostics = diagnostics;
  }
}

/** Validate the authored finite outcome matrix and deterministic turn budget. */
export function validateLightweightEncounter(input: unknown): LightweightEncounterValidationReport {
  const diagnostics: LightweightEncounterDiagnostic[] = [];
  const add = (code: string, path: string, message: string) =>
    diagnostics.push({ severity: 'error', code, path, message });
  if (!isRecord(input)) {
    add('invalid-shape', '$', 'Expected a lightweight encounter definition object.');
    return report(diagnostics);
  }
  const treeDiagnostics: GameplayDiagnostic[] = [];
  if (!validateJsonTree(input, '$', treeDiagnostics)) {
    diagnostics.push(
      ...treeDiagnostics.map(({ code, path, message }) => ({
        severity: 'error' as const,
        code,
        path,
        message,
      })),
    );
    return report(diagnostics);
  }
  if (input.schemaVersion !== 1)
    add('unsupported-version', 'schemaVersion', 'Expected schemaVersion 1.');
  if (!isId(input.id)) add('invalid-id', 'id', 'Expected a stable definition ID.');
  if (!isId(input.opponentId)) add('invalid-id', 'opponentId', 'Expected a stable opponent ID.');
  if (!isInteger(input.hearts, 1))
    add('invalid-budget', 'hearts', 'Hearts must be a positive bounded integer.');
  if (!isInteger(input.maxRounds, 1))
    add('invalid-budget', 'maxRounds', 'maxRounds must be a positive bounded integer.');

  const actions = readIds(input.availableActions, 'availableActions', add);
  const abilities =
    input.offeredAbilities === undefined
      ? []
      : readIds(input.offeredAbilities, 'offeredAbilities', add);
  const intents = readIds(input.enemyIntentPattern, 'enemyIntentPattern', add, true);
  if (actions.length === 0)
    add('no-actions', 'availableActions', 'At least one available action is required.');
  if (intents.length === 0)
    add(
      'empty-intent-pattern',
      'enemyIntentPattern',
      'At least one deterministic intent is required.',
    );
  const actionIds = [...actions, ...abilities];
  for (const ability of abilities) {
    if (actions.includes(ability))
      add('duplicate-id', 'offeredAbilities', `Action ${ability} is already always available.`);
  }
  if (
    input.weaknessActionId !== undefined &&
    (!isId(input.weaknessActionId) || !actionIds.includes(input.weaknessActionId))
  ) {
    add(
      'weakness-not-offered',
      'weaknessActionId',
      'Weakness must name an available action or offered ability.',
    );
  }
  const bonusValue = input.weaknessBonusDamage === undefined ? 1 : input.weaknessBonusDamage;
  if (!isInteger(bonusValue, 0))
    add(
      'invalid-damage',
      'weaknessBonusDamage',
      'Weakness bonus must be a nonnegative bounded integer.',
    );
  const bonus = isInteger(bonusValue, 0) ? bonusValue : 0;

  const outcomes = Array.isArray(input.outcomes) ? input.outcomes : [];
  if (!Array.isArray(input.outcomes))
    add('invalid-shape', 'outcomes', 'Expected an outcome matrix array.');
  const outcomeKeys = new Set<string>();
  const outcomeByKey = new Map<string, Record<string, unknown>>();
  outcomes.forEach((candidate, index) => {
    const path = `outcomes[${index}]`;
    if (!isRecord(candidate)) {
      add('invalid-shape', path, 'Expected an outcome matrix row.');
      return;
    }
    const { actionId, intentId, outcomeId, effective, opponentDamage, forcedNextIntentId } =
      candidate;
    if (!isId(actionId) || !actionIds.includes(actionId))
      add('unknown-action', `${path}.actionId`, 'Outcome action must be available or offered.');
    if (!isId(intentId) || !intents.includes(intentId))
      add(
        'unknown-intent',
        `${path}.intentId`,
        'Outcome intent must appear in the authored pattern.',
      );
    if (!isId(outcomeId)) add('invalid-id', `${path}.outcomeId`, 'Expected a stable outcome ID.');
    if (typeof effective !== 'boolean')
      add('invalid-outcome', `${path}.effective`, 'effective must be a boolean.');
    if (!isInteger(opponentDamage, 0))
      add(
        'invalid-damage',
        `${path}.opponentDamage`,
        'Opponent damage must be a nonnegative bounded integer.',
      );
    if (
      forcedNextIntentId !== undefined &&
      (!isId(forcedNextIntentId) || !intents.includes(forcedNextIntentId))
    )
      add(
        'unknown-intent',
        `${path}.forcedNextIntentId`,
        'Forced intent must appear in the authored pattern.',
      );
    if (isId(actionId) && isId(intentId)) {
      const key = `${actionId}\u0000${intentId}`;
      if (outcomeKeys.has(key))
        add('duplicate-outcome', path, 'Each action and intent pair must have one outcome.');
      outcomeKeys.add(key);
      if (
        isId(actionId) &&
        isId(intentId) &&
        isId(outcomeId) &&
        typeof effective === 'boolean' &&
        isInteger(opponentDamage, 0)
      ) {
        outcomeByKey.set(key, candidate);
      }
    }
  });

  const uniqueIntents = [...new Set(intents)];
  for (const action of actionIds) {
    for (const intent of uniqueIntents) {
      if (!outcomeKeys.has(`${action}\u0000${intent}`))
        add(
          'incomplete-outcome-matrix',
          'outcomes',
          `Missing outcome for ${action} against ${intent}.`,
        );
    }
  }

  if (diagnostics.length === 0 && isInteger(input.hearts, 1) && isInteger(input.maxRounds, 1)) {
    let potential = 0;
    for (let round = 1; round <= input.maxRounds; round += 1) {
      const intent = intents[(round - 1) % intents.length]!;
      let best = 0;
      for (const action of actions) {
        const result = outcomeByKey.get(`${action}\u0000${intent}`)!;
        best = Math.max(best, outcomeDamage(input.weaknessActionId, action, result, bonus));
      }
      potential += best;
    }
    if (potential < input.hearts)
      add(
        'unwinnable-encounter',
        'outcomes',
        `Base actions can deal at most ${potential} damage within ${input.maxRounds} rounds, below ${input.hearts} hearts.`,
      );
  }
  return report(diagnostics);
}

/** Copy and freeze a validated definition so later edits cannot change a run. */
export function compileLightweightEncounter(
  definition: LightweightEncounterDefinition,
): CompiledLightweightEncounter {
  const validation = validateLightweightEncounter(definition);
  if (!validation.ok) throw new LightweightEncounterDefinitionError(validation.diagnostics);
  let snapshot: LightweightEncounterDefinition;
  try {
    snapshot = cloneAndFreeze(definition) as LightweightEncounterDefinition;
  } catch {
    throw new LightweightEncounterDefinitionError([
      {
        severity: 'error',
        code: 'invalid-json',
        path: '$',
        message: 'Definition must be compatible with JSON serialization.',
      },
    ]);
  }
  const compiled = Object.freeze({ id: snapshot.id, definition: snapshot });
  COMPILED.add(compiled);
  return compiled;
}

/** Start one transient run, adding only abilities explicitly unlocked by the app. */
export function createLightweightEncounter(
  compiled: CompiledLightweightEncounter,
  battleId: string,
  unlockedAbilityIds: readonly string[] = [],
): LightweightEncounterState {
  if (
    !compiled ||
    !COMPILED.has(compiled) ||
    !isId(compiled.id) ||
    compiled.id !== compiled.definition.id
  )
    throw new TypeError('Expected a compiled lightweight encounter.');
  if (!isId(battleId)) throw new TypeError('Expected a stable encounter instance ID.');
  const offered = compiled.definition.offeredAbilities ?? [];
  const unlocked = new Set(unlockedAbilityIds.filter(isId));
  const runDefinition = cloneAndFreeze({
    ...compiled.definition,
    availableActions: [
      ...compiled.definition.availableActions,
      ...offered.filter((abilityId) => unlocked.has(abilityId)),
    ],
  }) as LightweightEncounterDefinition;
  const state: LightweightEncounterState = {
    definition: runDefinition,
    battleId,
    opponentId: runDefinition.opponentId,
    phase: 'intro',
    revision: 0,
    round: 1,
    playerHearts: runDefinition.hearts,
    opponentHearts: runDefinition.hearts,
    enemyIntent: runDefinition.enemyIntentPattern[0]!,
    lastActionId: null,
    lastOutcomeId: null,
    rounds: Object.freeze([]),
  };
  return Object.freeze(state);
}

/** Pure single-action/phase transition; invalid and stale commands preserve identity. */
export function transitionLightweightEncounter(
  state: LightweightEncounterState,
  command: LightweightEncounterCommand,
): LightweightEncounterState {
  if (
    !state ||
    !command ||
    command.expectedRevision !== state.revision ||
    state.revision >= Number.MAX_SAFE_INTEGER
  )
    return state;
  if (command.type === 'choose-action') {
    if (
      state.phase !== 'playerChoice' ||
      !state.definition.availableActions.includes(command.actionId)
    )
      return state;
    const outcome = state.definition.outcomes.find(
      (row) => row.actionId === command.actionId && row.intentId === state.enemyIntent,
    );
    if (!outcome) return state;
    const damage = outcomeDamage(
      state.definition.weaknessActionId,
      command.actionId,
      outcome,
      state.definition.weaknessBonusDamage ?? 1,
    );
    const round: LightweightEncounterRound = Object.freeze({
      actionId: command.actionId,
      intentId: state.enemyIntent,
      outcomeId: outcome.outcomeId,
      effective: outcome.effective,
      opponentDamage: damage,
    });
    return Object.freeze({
      ...state,
      phase: 'playerResolution',
      revision: state.revision + 1,
      lastActionId: command.actionId,
      lastOutcomeId: outcome.outcomeId,
      opponentHearts: Math.max(0, state.opponentHearts - damage),
      ...(outcome.forcedNextIntentId === undefined
        ? { forcedIntentId: undefined }
        : { forcedIntentId: outcome.forcedNextIntentId }),
      rounds: Object.freeze([...state.rounds, round]),
    });
  }
  if (command.type !== 'advance-phase') return state;
  switch (state.phase) {
    case 'intro':
      return nextState(state, { phase: 'playerChoice' });
    case 'playerResolution':
      return nextState(state, { phase: 'enemyResolution' });
    case 'enemyResolution':
      return nextState(state, { phase: 'roundCheck' });
    case 'roundCheck': {
      if (state.opponentHearts <= 0) return nextState(state, { phase: 'victory' });
      if (state.round >= state.definition.maxRounds) return nextState(state, { phase: 'defeat' });
      const round = state.round + 1;
      const forcedIntentId = state.forcedIntentId;
      const enemyIntent =
        forcedIntentId ??
        state.definition.enemyIntentPattern[
          (round - 1) % state.definition.enemyIntentPattern.length
        ]!;
      return nextState(state, {
        phase: 'playerChoice',
        round,
        enemyIntent,
        forcedIntentId: undefined,
        lastActionId: null,
        lastOutcomeId: null,
      });
    }
    case 'playerChoice':
    case 'victory':
    case 'defeat':
      return state;
  }
}

function nextState(
  state: LightweightEncounterState,
  changes: Partial<LightweightEncounterState>,
): LightweightEncounterState {
  return Object.freeze({ ...state, ...changes, revision: state.revision + 1 });
}

function outcomeDamage(
  weaknessActionId: unknown,
  actionId: string,
  outcome: Record<string, unknown> | LightweightEncounterOutcomeDefinition,
  weaknessBonusDamage: number,
): number {
  const base = typeof outcome.opponentDamage === 'number' ? outcome.opponentDamage : 0;
  return (
    base + (actionId === weaknessActionId && outcome.effective === true ? weaknessBonusDamage : 0)
  );
}

function readIds(
  value: unknown,
  path: string,
  add: (code: string, path: string, message: string) => void,
  allowRepeats = false,
): string[] {
  if (!Array.isArray(value)) {
    add('invalid-shape', path, 'Expected an array of stable IDs.');
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!isId(item)) {
      add('invalid-id', `${path}[${index}]`, 'Expected a stable ID.');
      return;
    }
    if (seen.has(item) && !allowRepeats)
      add('duplicate-id', `${path}[${index}]`, `Duplicate ID ${item}.`);
    else seen.add(item);
    result.push(item);
  });
  return result;
}

function report(
  diagnostics: LightweightEncounterDiagnostic[],
): LightweightEncounterValidationReport {
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item))),
    ok: diagnostics.length === 0,
  });
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function isInteger(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= MAX_BUDGET
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneAndFreeze<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;
  const visit = (current: unknown): void => {
    if (typeof current !== 'object' || current === null || Object.isFrozen(current)) return;
    for (const child of Object.values(current)) visit(child);
    Object.freeze(current);
  };
  visit(clone);
  return clone;
}
