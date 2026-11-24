import type {
  ActiveDialogue,
  CompiledNarrative,
  DialogueView,
  JsonValue,
  NarrativeFactDefinition,
  NarrativeDecodeResult,
  NarrativeQuestHistory,
  NarrativeState,
  NarrativeStateSeed,
  PersistedQuestStatus,
  QuestStatus,
} from './definition.js';
import { compiledIndexes } from './compile.js';
import { evaluateCondition } from './conditions.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const SAFE_FACT_KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PERSISTED_STATUSES = new Set<PersistedQuestStatus>([
  'active',
  'completed',
  'failed',
  'cancelled',
]);
const STATE_KEYS = new Set([
  'schemaVersion',
  'storyId',
  'compatibilityVersion',
  'playthroughId',
  'revision',
  'facts',
  'quests',
  'questHistory',
  'appliedChoiceIds',
  'appliedTriggerIds',
  'activeDialogue',
  'suspendedDialogue',
  'endingId',
]);

type Draft = {
  schemaVersion: 1;
  storyId: string;
  compatibilityVersion: string;
  playthroughId: string;
  revision: number;
  facts: Record<string, JsonValue>;
  quests: Record<string, PersistedQuestStatus>;
  questHistory: Record<string, NarrativeQuestHistory>;
  appliedChoiceIds: string[];
  appliedTriggerIds: string[];
  activeDialogue: ActiveDialogue | null;
  suspendedDialogue: ActiveDialogue | null;
  endingId: string | null;
};

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  if (plainRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = cloneJson(entry);
    return copy as T;
  }
  return value;
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function snapshotDraft(draft: Draft): NarrativeState {
  return freezeDeep(cloneJson(draft));
}

function defaultFacts(
  definitions: readonly NarrativeFactDefinition[] | undefined,
): Record<string, JsonValue> {
  const facts: Record<string, JsonValue> = {};
  for (const fact of definitions ?? [])
    if (Object.hasOwn(fact, 'default')) facts[fact.key] = fact.default as JsonValue;
  return facts;
}

function matchesFactType(value: unknown, type: NarrativeFactDefinition['type']): boolean {
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  return typeof value === 'string';
}

export function draftFromState(state: NarrativeState): Draft {
  return cloneJson(state) as Draft;
}

export function createNarrativeState(
  compiled: CompiledNarrative,
  playthroughId: string,
  seed: NarrativeStateSeed = {},
): NarrativeState {
  const indexes = compiledIndexes(compiled);
  if (typeof playthroughId !== 'string' || !SAFE_ID.test(playthroughId)) {
    throw new TypeError('playthroughId must be a stable ASCII identifier.');
  }
  if (!plainRecord(seed)) throw new TypeError('Narrative seed must be a plain object.');

  const facts = defaultFacts(compiled.definition.facts);
  if (seed.facts !== undefined) {
    if (!plainRecord(seed.facts))
      throw new TypeError('Narrative seed facts must be a plain object.');
    const declarations = compiled.definition.facts
      ? new Map(compiled.definition.facts.map((fact) => [fact.key, fact]))
      : null;
    for (const [key, value] of Object.entries(seed.facts)) {
      if (!SAFE_FACT_KEY.test(key) || UNSAFE_KEYS.has(key) || !validJson(value)) {
        throw new TypeError(`Narrative seed fact ${key} is unsafe.`);
      }
      const declaration = declarations?.get(key);
      if (declarations && !declaration) {
        throw new TypeError(`Narrative seed fact ${key} is not declared.`);
      }
      if (declaration && !matchesFactType(value, declaration.type)) {
        throw new TypeError(`Narrative seed fact ${key} has the wrong type.`);
      }
      facts[key] = cloneJson(value) as JsonValue;
    }
  }

  const quests: Record<string, PersistedQuestStatus> = {};
  if (seed.quests !== undefined) {
    if (!plainRecord(seed.quests))
      throw new TypeError('Narrative seed quests must be a plain object.');
    for (const [questId, status] of Object.entries(seed.quests)) {
      if (
        !indexes.quests.has(questId) ||
        typeof status !== 'string' ||
        !PERSISTED_STATUSES.has(status as PersistedQuestStatus)
      ) {
        throw new TypeError(`Narrative seed quest ${questId} is unknown or invalid.`);
      }
      quests[questId] = status as PersistedQuestStatus;
    }
  }

  const questHistory = normalizeQuestHistory(compiled, seed.questHistory, quests);
  return snapshotDraft({
    schemaVersion: 1,
    storyId: compiled.id,
    compatibilityVersion: compiled.compatibilityVersion,
    playthroughId,
    revision: 0,
    facts,
    quests,
    questHistory,
    appliedChoiceIds: [],
    appliedTriggerIds: [],
    activeDialogue: null,
    suspendedDialogue: null,
    endingId: null,
  });
}

export function getFact(state: NarrativeState, key: string): JsonValue | undefined {
  return Object.hasOwn(state.facts, key) ? state.facts[key] : undefined;
}

export function getQuestStatus(
  compiled: CompiledNarrative,
  state: NarrativeState,
  questId: string,
): QuestStatus {
  const quest = compiledIndexes(compiled).quests.get(questId);
  if (!quest) throw new RangeError(`Unknown quest id: ${questId}.`);
  const persisted = state.quests[questId];
  if (persisted) return persisted;
  return quest.prerequisites && !evaluateCondition(quest.prerequisites, state)
    ? 'locked'
    : 'available';
}

export function getDialogueView(
  compiled: CompiledNarrative,
  state: NarrativeState,
  locale: string,
): DialogueView | null {
  const active = state.activeDialogue;
  if (!active) return null;
  const dialogue = compiledIndexes(compiled).dialogues.get(active.dialogueId);
  const node = dialogue?.nodes.find((candidate) => candidate.id === active.nodeId);
  if (!dialogue || !node || (node.when && !evaluateCondition(node.when, state))) return null;
  const choices = (node.choices ?? []).map((choice) => ({
    id: choice.id,
    label: localized(choice.label, locale, compiled.definition.defaultLocale),
    available:
      (!choice.when || evaluateCondition(choice.when, state)) &&
      (choice.repeatable === true || !state.appliedChoiceIds.includes(choice.id)),
  }));
  return Object.freeze({
    dialogueId: dialogue.id,
    nodeId: node.id,
    speakerId: node.speakerId,
    text: localized(node.text, locale, compiled.definition.defaultLocale),
    terminal: node.terminal === true,
    closeAllowed: node.closesDialogue === true,
    exitAllowed: dialogue.exitPolicy === 'allowed',
    choices: Object.freeze(choices.map((choice) => Object.freeze(choice))),
  });
}

function localized(
  values: Readonly<Record<string, string>>,
  locale: string,
  defaultLocale?: string,
): string {
  if (values[locale]) return values[locale]!;
  const language = locale.split('-')[0];
  if (values[language!]) return values[language!]!;
  if (defaultLocale && values[defaultLocale]) return values[defaultLocale]!;
  const fallback = Object.keys(values).sort()[0];
  return fallback ? values[fallback]! : '';
}

export function decodeNarrativeState(
  compiled: CompiledNarrative,
  input: unknown,
): NarrativeDecodeResult {
  const indexes = compiledIndexes(compiled);
  if (
    !plainRecord(input) ||
    !validJson(input) ||
    Object.keys(input).some((key) => !STATE_KEYS.has(key)) ||
    (Object.hasOwn(input, 'questHistory')
      ? Object.keys(input).length !== STATE_KEYS.size
      : Object.keys(input).length !== STATE_KEYS.size - 1)
  ) {
    return decodeFailure(
      'invalid-payload',
      'Narrative save must be an object with the supported fields only.',
    );
  }
  if (input.schemaVersion !== 1)
    return decodeFailure('unsupported-schema', 'Narrative save schema is unsupported.');
  if (input.storyId !== compiled.id)
    return decodeFailure('story-mismatch', 'Narrative save belongs to another story.');
  if (input.compatibilityVersion !== compiled.compatibilityVersion) {
    return decodeFailure(
      'incompatible-definition',
      'Narrative content changed incompatibly; the saved bytes must be preserved for recovery.',
    );
  }
  if (
    typeof input.playthroughId !== 'string' ||
    !SAFE_ID.test(input.playthroughId) ||
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0
  ) {
    return decodeFailure('invalid-payload', 'Playthrough id or revision is invalid.');
  }
  if (
    !plainRecord(input.facts) ||
    !plainRecord(input.quests) ||
    !Array.isArray(input.appliedChoiceIds) ||
    !Array.isArray(input.appliedTriggerIds)
  ) {
    return decodeFailure(
      'invalid-payload',
      'Facts, quest states, and applied event ids have invalid shapes.',
    );
  }
  const factDeclarations = compiled.definition.facts;
  const declaredFacts =
    factDeclarations === undefined
      ? null
      : new Map(factDeclarations.map((fact) => [fact.key, fact]));
  const facts: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input.facts)) {
    if (!SAFE_FACT_KEY.test(key) || UNSAFE_KEYS.has(key) || !validJson(value))
      return decodeFailure('invalid-payload', `Fact ${key} is not safe JSON.`);
    const declaration = declaredFacts?.get(key);
    if (declaredFacts && !declaration)
      return decodeFailure('invalid-payload', `Fact ${key} is not declared by this story.`);
    if (declaration && !matchesFactType(value, declaration.type))
      return decodeFailure('invalid-payload', `Fact ${key} does not match its declared type.`);
    facts[key] = cloneJson(value) as JsonValue;
  }
  for (const declaration of factDeclarations ?? [])
    if (!Object.hasOwn(facts, declaration.key) && Object.hasOwn(declaration, 'default'))
      facts[declaration.key] = declaration.default as JsonValue;
  const quests: Record<string, PersistedQuestStatus> = {};
  for (const [questId, status] of Object.entries(input.quests)) {
    if (
      !indexes.quests.has(questId) ||
      typeof status !== 'string' ||
      !PERSISTED_STATUSES.has(status as PersistedQuestStatus)
    ) {
      return decodeFailure('invalid-payload', `Quest state ${questId} is unknown or invalid.`);
    }
    quests[questId] = status as PersistedQuestStatus;
  }
  let questHistory: Record<string, NarrativeQuestHistory>;
  try {
    questHistory = normalizeQuestHistory(compiled, input.questHistory, quests);
  } catch (error) {
    return decodeFailure(
      'invalid-payload',
      error instanceof Error ? error.message : 'Quest history is invalid.',
    );
  }
  const allChoices = new Set<string>();
  for (const dialogue of compiled.definition.dialogues)
    for (const node of dialogue.nodes)
      for (const choice of node.choices ?? []) allChoices.add(choice.id);
  const appliedChoiceIds: string[] = [];
  for (const choiceId of input.appliedChoiceIds) {
    if (
      typeof choiceId !== 'string' ||
      !allChoices.has(choiceId) ||
      appliedChoiceIds.includes(choiceId)
    ) {
      return decodeFailure(
        'invalid-payload',
        `Applied choice id ${String(choiceId)} is unknown or duplicated.`,
      );
    }
    appliedChoiceIds.push(choiceId);
  }
  const triggerIds = new Set((compiled.definition.triggers ?? []).map((trigger) => trigger.id));
  const appliedTriggerIds: string[] = [];
  for (const triggerId of input.appliedTriggerIds) {
    if (
      typeof triggerId !== 'string' ||
      !triggerIds.has(triggerId) ||
      appliedTriggerIds.includes(triggerId)
    ) {
      return decodeFailure(
        'invalid-payload',
        `Applied trigger id ${String(triggerId)} is unknown or duplicated.`,
      );
    }
    appliedTriggerIds.push(triggerId);
  }
  const activeResult = decodeDialoguePointer(indexes.dialogues, input.activeDialogue);
  if (!activeResult.ok)
    return decodeFailure('invalid-payload', `Active dialogue ${activeResult.message}`);
  const activeDialogue = activeResult.pointer;
  const suspendedResult = decodeDialoguePointer(indexes.dialogues, input.suspendedDialogue);
  if (!suspendedResult.ok)
    return decodeFailure('invalid-payload', `Suspended dialogue ${suspendedResult.message}`);
  const suspendedDialogue = suspendedResult.pointer;
  if (activeDialogue !== null && suspendedDialogue !== null)
    return decodeFailure('invalid-payload', 'Active and suspended dialogue cannot coexist.');
  if (
    input.endingId !== null &&
    (typeof input.endingId !== 'string' ||
      !compiled.definition.dialogues.some((dialogue) =>
        dialogue.nodes.some((node) => node.terminal && node.endingId === input.endingId),
      ))
  ) {
    return decodeFailure('invalid-payload', 'Ending id is not defined by this story.');
  }
  if (input.endingId !== null && (activeDialogue !== null || suspendedDialogue !== null))
    return decodeFailure(
      'invalid-payload',
      'A finished playthrough cannot have an active or suspended dialogue.',
    );
  const state = snapshotDraft({
    schemaVersion: 1,
    storyId: compiled.id,
    compatibilityVersion: compiled.compatibilityVersion,
    playthroughId: input.playthroughId,
    revision: input.revision as number,
    facts,
    quests,
    questHistory,
    appliedChoiceIds,
    appliedTriggerIds,
    activeDialogue,
    suspendedDialogue,
    endingId: input.endingId as string | null,
  });
  for (const pointer of [activeDialogue, suspendedDialogue]) {
    if (!pointer) continue;
    const dialogue = indexes.dialogues.get(pointer.dialogueId)!;
    const node = dialogue.nodes.find((candidate) => candidate.id === pointer.nodeId)!;
    if (
      (dialogue.when && !evaluateCondition(dialogue.when, state)) ||
      (node.when && !evaluateCondition(node.when, state))
    ) {
      return decodeFailure(
        'invalid-payload',
        'Saved dialogue is no longer eligible under its story conditions.',
      );
    }
  }
  return { ok: true, state };
}

function normalizeQuestHistory(
  compiled: CompiledNarrative,
  input: unknown,
  quests: Readonly<Record<string, PersistedQuestStatus>>,
): Record<string, NarrativeQuestHistory> {
  const indexes = compiledIndexes(compiled);
  if (input !== undefined && !plainRecord(input)) {
    throw new TypeError('Narrative quest history must be a plain object.');
  }
  const source = (input ?? {}) as Record<string, unknown>;
  const result: Record<string, NarrativeQuestHistory> = {};
  for (const [questId, rawHistory] of Object.entries(source)) {
    const quest = indexes.quests.get(questId);
    if (!quest || !plainRecord(rawHistory)) {
      throw new TypeError(`Narrative quest history ${questId} is unknown or invalid.`);
    }
    if (
      Object.keys(rawHistory).sort().join('\0') !==
        ['completionCount', 'completedSteps'].sort().join('\0') ||
      !Number.isSafeInteger(rawHistory.completionCount) ||
      (rawHistory.completionCount as number) < 0 ||
      !Array.isArray(rawHistory.completedSteps)
    ) {
      throw new TypeError(`Narrative quest history ${questId} has invalid progress.`);
    }
    const completedSteps: string[] = [];
    for (const stepId of rawHistory.completedSteps) {
      if (
        typeof stepId !== 'string' ||
        !SAFE_ID.test(stepId) ||
        completedSteps.includes(stepId) ||
        (quest.stepIds !== undefined && !quest.stepIds.includes(stepId))
      ) {
        throw new TypeError(`Narrative quest history ${questId} has an invalid step id.`);
      }
      completedSteps.push(stepId);
    }
    if (rawHistory.completionCount === 0 && completedSteps.length > 0) {
      throw new TypeError(`Narrative quest history ${questId} has steps without a completion.`);
    }
    result[questId] = {
      completionCount: rawHistory.completionCount as number,
      completedSteps,
    };
  }

  // Narrative snapshots from before quest history existed can only prove that
  // a completed quest finished at least once. Preserve that fact and any step
  // ids authored in the compatible definition without replaying its effects.
  for (const [questId, status] of Object.entries(quests)) {
    if (status !== 'completed' || Object.hasOwn(result, questId)) continue;
    const stepIds = indexes.quests.get(questId)?.stepIds ?? [];
    result[questId] = { completionCount: 1, completedSteps: [...stepIds] };
  }
  return result;
}

function decodeDialoguePointer(
  dialogues: ReadonlyMap<string, CompiledNarrative['definition']['dialogues'][number]>,
  value: unknown,
):
  | { readonly ok: true; readonly pointer: ActiveDialogue | null }
  | {
      readonly ok: false;
      readonly message: string;
    } {
  if (value === null) return { ok: true, pointer: null };
  if (
    !plainRecord(value) ||
    Object.keys(value).sort().join('\0') !== ['dialogueId', 'nodeId'].sort().join('\0') ||
    typeof value.dialogueId !== 'string' ||
    typeof value.nodeId !== 'string'
  )
    return { ok: false, message: 'pointer is invalid.' };
  const dialogue = dialogues.get(value.dialogueId);
  const node = dialogue?.nodes.find((candidate) => candidate.id === value.nodeId);
  if (!dialogue || !node) return { ok: false, message: 'pointer refers to missing content.' };
  return { ok: true, pointer: { dialogueId: dialogue.id, nodeId: node.id } };
}

function validJson(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length
    )
      valid = false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        !validJson(descriptor.value, seen, depth + 1)
      )
        valid = false;
    }
    const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
    if (
      keys.length !== value.length ||
      keys.some(
        (key) =>
          typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length,
      )
    )
      valid = false;
  } else if (plainRecord(value)) {
    if (Object.getOwnPropertySymbols(value).length) valid = false;
    for (const rawKey of Reflect.ownKeys(value)) {
      if (typeof rawKey !== 'string') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
      if (
        UNSAFE_KEYS.has(rawKey) ||
        !descriptor?.enumerable ||
        !('value' in descriptor) ||
        !validJson(descriptor.value, seen, depth + 1)
      )
        valid = false;
    }
  } else valid = false;
  seen.delete(value);
  return valid;
}

function decodeFailure(
  reason: Exclude<NarrativeDecodeResult, { readonly ok: true }>['reason'],
  message: string,
): NarrativeDecodeResult {
  return { ok: false, reason, message };
}
