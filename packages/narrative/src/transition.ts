import type {
  CompiledNarrative,
  DialogueDefinition,
  DialogueNodeDefinition,
  JsonValue,
  NarrativeCommand,
  NarrativeEffect,
  NarrativeRejectionCode,
  NarrativeState,
  NarrativeTransitionResult,
  PersistedQuestStatus,
} from './definition.js';
import { compiledIndexes } from './compile.js';
import { evaluateCondition } from './conditions.js';
import { draftFromState, getQuestStatus, snapshotDraft } from './state.js';

interface EffectFailure {
  readonly code: NarrativeRejectionCode;
  readonly message: string;
  readonly effectIndex: number;
}

export function transitionNarrative(
  compiled: CompiledNarrative,
  state: NarrativeState,
  command: NarrativeCommand,
): NarrativeTransitionResult {
  const indexes = compiledIndexes(compiled);
  if (!isRecord(command) || typeof command.type !== 'string')
    return reject(state, 'invalid-command', 'Command shape is invalid.');
  if (!isRecord(state))
    return reject(state, 'invalid-command', 'Narrative state shape is invalid.');
  if (state.storyId !== compiled.id)
    return reject(state, 'story-mismatch', 'State belongs to another story.');
  if (state.compatibilityVersion !== compiled.compatibilityVersion)
    return reject(
      state,
      'compatibility-mismatch',
      'State is incompatible with this narrative definition.',
    );
  if (typeof command.playthroughId !== 'string' || command.playthroughId !== state.playthroughId)
    return reject(state, 'wrong-playthrough', 'Command belongs to another playthrough.');
  if (
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision !== state.revision
  )
    return reject(state, 'stale-revision', 'Command revision is stale.');
  if (state.endingId !== null)
    return reject(state, 'ending-final', 'This playthrough has already reached its final ending.');
  if (
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    state.revision >= Number.MAX_SAFE_INTEGER
  )
    return reject(state, 'revision-overflow', 'Narrative revision cannot advance safely.');

  const draft = draftFromState(state);
  const finish = (
    change: Extract<NarrativeTransitionResult, { accepted: true }>['change'],
  ): NarrativeTransitionResult => {
    draft.revision += 1;
    return { accepted: true, change, state: snapshotDraft(draft) };
  };

  switch (command.type) {
    case 'open-dialogue': {
      if (state.activeDialogue)
        return reject(state, 'dialogue-active', 'A dialogue is already active.');
      const dialogue = indexes.dialogues.get(command.dialogueId);
      if (!dialogue || (dialogue.when && !evaluateCondition(dialogue.when, state)))
        return reject(
          state,
          'dialogue-unavailable',
          'Dialogue is unknown or its entry condition is not satisfied.',
        );
      if (state.suspendedDialogue && state.suspendedDialogue.dialogueId !== dialogue.id)
        return reject(
          state,
          'dialogue-suspended',
          'Resume or finish the suspended dialogue before opening another one.',
        );
      const startNodeId =
        command.startNodeId ?? state.suspendedDialogue?.nodeId ?? dialogue.entryNodeId;
      const entry = dialogue.nodes.find((node) => node.id === startNodeId);
      if (!entry || (entry.when && !evaluateCondition(entry.when, state)))
        return reject(state, 'node-unavailable', 'Dialogue entry node is unavailable.');
      draft.activeDialogue = { dialogueId: dialogue.id, nodeId: entry.id };
      draft.suspendedDialogue = null;
      return finish('dialogue');
    }
    case 'advance': {
      const current = activeNode(compiled, state);
      if (!current) return reject(state, 'no-active-dialogue', 'There is no active dialogue.');
      if (!current.node.nextNodeId || current.node.choices)
        return reject(state, 'not-linear', 'Only a linear dialogue node can advance.');
      const next = current.dialogue.nodes.find((node) => node.id === current.node.nextNodeId);
      if (!next || (next.when && !evaluateCondition(next.when, state)))
        return reject(state, 'node-unavailable', 'The next dialogue node is unavailable.');
      draft.activeDialogue = { dialogueId: current.dialogue.id, nodeId: next.id };
      return finish('dialogue');
    }
    case 'choose': {
      const current = activeNode(compiled, state);
      if (!current) return reject(state, 'no-active-dialogue', 'There is no active dialogue.');
      if (!current.node.choices)
        return reject(state, 'choice-unavailable', 'This dialogue node has no choices.');
      const choice = current.node.choices.find((item) => item.id === command.choiceId);
      if (!choice || (choice.when && !evaluateCondition(choice.when, state)))
        return reject(
          state,
          'choice-unavailable',
          'Choice does not exist or is not currently available.',
        );
      if (!choice.repeatable && state.appliedChoiceIds.includes(choice.id))
        return reject(
          state,
          'choice-already-applied',
          'This one-time choice was already applied in this playthrough.',
        );
      const failure = applyEffects(compiled, draft, choice.effects ?? []);
      if (failure) return rejectEffect(state, failure);
      const target = current.dialogue.nodes.find((node) => node.id === choice.targetNodeId);
      if (!target || (target.when && !evaluateCondition(target.when, draft as NarrativeState)))
        return reject(state, 'node-unavailable', 'Choice target is unavailable after its effects.');
      if (!draft.appliedChoiceIds.includes(choice.id)) draft.appliedChoiceIds.push(choice.id);
      draft.activeDialogue = { dialogueId: current.dialogue.id, nodeId: target.id };
      return finish('choice');
    }
    case 'exit-dialogue': {
      const current = activeNode(compiled, state);
      if (!current)
        return reject(state, 'no-active-dialogue', 'There is no active dialogue to exit.');
      if (current.dialogue.exitPolicy === 'forbidden')
        return reject(state, 'exit-forbidden', 'This dialogue does not permit exit.');
      draft.suspendedDialogue = state.activeDialogue;
      draft.activeDialogue = null;
      return finish('dialogue');
    }
    case 'close-dialogue': {
      const current = activeNode(compiled, state);
      if (!current)
        return reject(state, 'no-active-dialogue', 'There is no active dialogue to close.');
      if (current.node.closesDialogue !== true)
        return reject(
          state,
          'dialogue-not-closeable',
          'This dialogue node is not an authored conversation endpoint.',
        );
      draft.activeDialogue = null;
      draft.suspendedDialogue = null;
      return finish('dialogue');
    }
    case 'finish': {
      const current = activeNode(compiled, state);
      if (!current)
        return reject(state, 'no-active-dialogue', 'There is no active dialogue to finish.');
      if (!current.node.terminal || !current.node.endingId)
        return reject(state, 'not-terminal', 'Only a terminal dialogue node can finish the story.');
      draft.activeDialogue = null;
      draft.suspendedDialogue = null;
      draft.endingId = current.node.endingId;
      return finish('ending');
    }
    case 'trigger': {
      if (state.activeDialogue)
        return reject(state, 'dialogue-active', 'World triggers are unavailable during dialogue.');
      const trigger = indexes.triggers.get(command.triggerId);
      if (!trigger || (trigger.when && !evaluateCondition(trigger.when, state)))
        return reject(
          state,
          'trigger-unavailable',
          'Trigger is unknown or its condition is not satisfied.',
        );
      if (!trigger.repeatable && state.appliedTriggerIds.includes(trigger.id))
        return reject(
          state,
          'trigger-unavailable',
          'This one-time trigger was already applied in this playthrough.',
        );
      const failure = applyEffects(compiled, draft, trigger.effects);
      if (failure) return rejectEffect(state, failure);
      if (!draft.appliedTriggerIds.includes(trigger.id)) draft.appliedTriggerIds.push(trigger.id);
      return finish('trigger');
    }
    default:
      return reject(state, 'invalid-command', 'Command type is not supported.');
  }
}

function activeNode(
  compiled: CompiledNarrative,
  state: NarrativeState,
): {
  readonly dialogue: DialogueDefinition;
  readonly node: DialogueNodeDefinition;
} | null {
  if (!state.activeDialogue) return null;
  const dialogue = compiledIndexes(compiled).dialogues.get(state.activeDialogue.dialogueId);
  const node = dialogue?.nodes.find((item) => item.id === state.activeDialogue!.nodeId);
  return dialogue && node ? { dialogue, node } : null;
}

function applyEffects(
  compiled: CompiledNarrative,
  draft: ReturnType<typeof draftFromState>,
  effects: readonly NarrativeEffect[],
): EffectFailure | null {
  for (const [effectIndex, effect] of effects.entries()) {
    if (!isRecord(effect) || typeof effect.op !== 'string')
      return { code: 'invalid-effect', message: 'Effect data is invalid.', effectIndex };
    switch (effect.op) {
      case 'set-flag':
        if (
          typeof effect.key !== 'string' ||
          typeof effect.value !== 'boolean' ||
          !matchesDeclaredFact(compiled, effect.key, effect.value, 'boolean')
        )
          return invalidEffect(effectIndex, 'set-flag operands are invalid.');
        draft.facts[effect.key] = effect.value;
        break;
      case 'clear-flag':
        if (
          typeof effect.key !== 'string' ||
          !matchesDeclaredFact(compiled, effect.key, false, 'boolean')
        )
          return invalidEffect(effectIndex, 'clear-flag key is invalid.');
        draft.facts[effect.key] = false;
        break;
      case 'clear-fact': {
        if (typeof effect.key !== 'string')
          return invalidEffect(effectIndex, 'clear-fact key is invalid.');
        const declaration = compiled.definition.facts?.find((fact) => fact.key === effect.key);
        if (compiled.definition.facts && !declaration)
          return invalidEffect(effectIndex, 'clear-fact key is not declared.');
        if (declaration && Object.hasOwn(declaration, 'default'))
          draft.facts[effect.key] = cloneJson(declaration.default) as JsonValue;
        else delete draft.facts[effect.key];
        break;
      }
      case 'set-fact':
        if (
          typeof effect.key !== 'string' ||
          !validJson(effect.value) ||
          !matchesDeclaredFact(compiled, effect.key, effect.value)
        )
          return invalidEffect(effectIndex, 'set-fact operands are invalid.');
        draft.facts[effect.key] = cloneJson(effect.value);
        break;
      case 'increment-fact': {
        if (
          typeof effect.key !== 'string' ||
          !Number.isSafeInteger(effect.amount) ||
          effect.amount === 0 ||
          !matchesDeclaredFact(compiled, effect.key, 0, 'integer')
        )
          return invalidEffect(effectIndex, 'increment-fact operands are invalid.');
        const oldValue = Object.hasOwn(draft.facts, effect.key) ? draft.facts[effect.key] : 0;
        if (typeof oldValue !== 'number' || !Number.isSafeInteger(oldValue))
          return invalidEffect(
            effectIndex,
            'increment-fact requires a safe integer fact; a missing fact starts at zero.',
          );
        const nextValue = oldValue + effect.amount;
        if (!Number.isSafeInteger(nextValue))
          return invalidEffect(effectIndex, 'increment-fact would overflow a safe integer.');
        draft.facts[effect.key] = nextValue;
        break;
      }
      case 'start-quest': {
        const quest = compiledIndexes(compiled).quests.get(effect.questId);
        if (!quest) return questFailure(effectIndex, `Unknown quest ${effect.questId}.`);
        const current = draft.quests[quest.id];
        if (current === 'active' || current === 'completed')
          if (current === 'active' || quest.repeatable !== true)
            return questFailure(effectIndex, `Quest ${quest.id} cannot start from ${current}.`);
        if (current === 'failed' || current === 'cancelled') {
          if (quest.restartable !== true)
            return questFailure(effectIndex, `Quest ${quest.id} is not restartable.`);
        } else if (
          current !== 'completed' &&
          getQuestStatus(compiled, draft as NarrativeState, quest.id) !== 'available'
        ) {
          return questFailure(effectIndex, `Quest ${quest.id} is locked by its prerequisites.`);
        }
        if (
          current === 'completed' &&
          quest.prerequisites !== undefined &&
          !evaluateCondition(quest.prerequisites, draft as NarrativeState)
        ) {
          return questFailure(effectIndex, `Quest ${quest.id} is locked by its prerequisites.`);
        }
        draft.quests[quest.id] = 'active';
        break;
      }
      case 'complete-quest':
        if (!completeQuest(compiled, draft, effect.questId))
          return questFailure(
            effectIndex,
            `Quest ${effect.questId} must be active before it can complete.`,
          );
        break;
      case 'fail-quest':
        if (!setQuestOutcome(draft, effect.questId, 'failed'))
          return questFailure(
            effectIndex,
            `Quest ${effect.questId} must be active before it can fail.`,
          );
        break;
      case 'cancel-quest':
        if (!setQuestOutcome(draft, effect.questId, 'cancelled'))
          return questFailure(
            effectIndex,
            `Quest ${effect.questId} must be active before it can cancel.`,
          );
        break;
      default:
        return invalidEffect(effectIndex, 'Unknown effect operation.');
    }
  }
  return null;
}

function matchesDeclaredFact(
  compiled: CompiledNarrative,
  key: string,
  value: unknown,
  requiredType?: 'boolean' | 'integer',
): boolean {
  const definitions = compiled.definition.facts;
  if (!definitions) return true;
  const declaration = definitions.find((fact) => fact.key === key);
  if (!declaration || (requiredType && declaration.type !== requiredType)) return false;
  if (declaration.type === 'boolean') return typeof value === 'boolean';
  if (declaration.type === 'integer')
    return typeof value === 'number' && Number.isSafeInteger(value);
  return typeof value === 'string';
}

function setQuestOutcome(
  draft: ReturnType<typeof draftFromState>,
  questId: string,
  status: Exclude<PersistedQuestStatus, 'active'>,
): boolean {
  if (typeof questId !== 'string' || draft.quests[questId] !== 'active') return false;
  draft.quests[questId] = status;
  return true;
}

function completeQuest(
  compiled: CompiledNarrative,
  draft: ReturnType<typeof draftFromState>,
  questId: string,
): boolean {
  const quest = compiledIndexes(compiled).quests.get(questId);
  if (!quest || draft.quests[questId] !== 'active') return false;
  const previous = draft.questHistory[questId] ?? { completionCount: 0, completedSteps: [] };
  if (previous.completionCount >= Number.MAX_SAFE_INTEGER) return false;
  const completedSteps = new Set(previous.completedSteps);
  for (const stepId of quest.stepIds ?? []) completedSteps.add(stepId);
  draft.questHistory[questId] = {
    completionCount: previous.completionCount + 1,
    completedSteps: [...completedSteps],
  };
  draft.quests[questId] = 'completed';
  return true;
}

function invalidEffect(effectIndex: number, message: string): EffectFailure {
  return { code: 'invalid-effect', message, effectIndex };
}

function questFailure(effectIndex: number, message: string): EffectFailure {
  return { code: 'quest-transition', message, effectIndex };
}

function rejectEffect(state: NarrativeState, failure: EffectFailure): NarrativeTransitionResult {
  return {
    accepted: false,
    state,
    reason: { code: failure.code, message: failure.message, effectIndex: failure.effectIndex },
  };
}

function reject(
  state: NarrativeState,
  code: NarrativeRejectionCode,
  message: string,
): NarrativeTransitionResult {
  return { accepted: false, state, reason: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((child) => cloneJson(child)) as T;
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) copy[key] = cloneJson(child);
    return copy as T;
  }
  return value;
}

function validJson(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    for (const item of value) if (!validJson(item, seen)) valid = false;
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || !validJson(item, seen))
        valid = false;
    }
  } else valid = false;
  seen.delete(value);
  return valid;
}
