import type {
  DialogueChoiceDefinition,
  DialogueDefinition,
  DialogueNodeDefinition,
  NarrativeCondition,
  NarrativeDiagnostic,
  NarrativeEffect,
  NarrativeValidationReport,
  PersistedQuestStatus,
  QuestDefinition,
} from './definition.js';

const ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const FACT_KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const STATUSES = new Set<PersistedQuestStatus>(['active', 'completed', 'failed', 'cancelled']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeJson(
  value: unknown,
  path: string,
  issues: NarrativeDiagnostic[],
  seen = new Set<object>(),
  depth = 0,
): boolean {
  if (depth > 32) {
    issues.push({
      severity: 'error',
      code: 'json-depth',
      path,
      message: 'JSON nesting exceeds 32 levels.',
    });
    return false;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return true;
    issues.push({
      severity: 'error',
      code: 'non-finite-number',
      path,
      message: 'Numbers must be finite.',
    });
    return false;
  }
  if (typeof value !== 'object') {
    issues.push({
      severity: 'error',
      code: 'non-json-value',
      path,
      message: 'Definitions may contain JSON values only.',
    });
    return false;
  }
  if (seen.has(value)) {
    issues.push({
      severity: 'error',
      code: 'cyclic-json',
      path,
      message: 'Definitions cannot contain cycles.',
    });
    return false;
  }
  seen.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      issues.push({
        severity: 'error',
        code: 'non-plain-array',
        path,
        message: 'Arrays must use the standard array prototype.',
      });
      valid = false;
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      issues.push({
        severity: 'error',
        code: 'symbol-key',
        path,
        message: 'Symbol keys are not valid JSON keys.',
      });
      valid = false;
    }
    const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
    if (
      keys.some(
        (key) =>
          typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length,
      ) ||
      keys.length !== value.length
    ) {
      issues.push({
        severity: 'error',
        code: 'sparse-array',
        path,
        message: 'Arrays must be dense JSON arrays without extra properties.',
      });
      valid = false;
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        !safeJson(descriptor.value, `${path}[${index}]`, issues, seen, depth + 1)
      )
        valid = false;
    }
  } else if (plainRecord(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      issues.push({
        severity: 'error',
        code: 'symbol-key',
        path,
        message: 'Symbol keys are not valid JSON keys.',
      });
      valid = false;
    }
    for (const rawKey of Reflect.ownKeys(value)) {
      if (typeof rawKey !== 'string') continue;
      const key = rawKey;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        UNSAFE_KEYS.has(key) ||
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        issues.push({
          severity: 'error',
          code: 'unsafe-key',
          path: `${path}.${key}`,
          message: 'Unsafe keys and accessor properties are forbidden.',
        });
        valid = false;
        continue;
      }
      if (!safeJson(descriptor.value, `${path}.${key}`, issues, seen, depth + 1)) valid = false;
    }
  } else {
    issues.push({
      severity: 'error',
      code: 'non-plain-object',
      path,
      message: 'Objects must use a plain JSON prototype.',
    });
    valid = false;
  }
  seen.delete(value);
  return valid;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return plainRecord(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function validateNarrative(input: unknown): NarrativeValidationReport {
  const diagnostics: NarrativeDiagnostic[] = [];
  const add = (
    code: string,
    path: string,
    message: string,
    severity: 'error' | 'warning' = 'error',
  ) => diagnostics.push({ severity, code, path, message });

  if (!isObject(input)) {
    add('invalid-definition', '$', 'Definition must be a plain JSON object.');
    return report(diagnostics);
  }
  if (!safeJson(input, '$', diagnostics)) return report(diagnostics);
  if (input.schemaVersion !== 1)
    add('schema-version', '$.schemaVersion', 'Only schemaVersion 1 is supported.');
  for (const key of ['id', 'contentVersion', 'compatibilityVersion'] as const) {
    if (typeof input[key] !== 'string' || input[key].length === 0 || input[key].length > 128) {
      add(
        'invalid-version-field',
        `$.${key}`,
        `${key} must be a non-empty string of at most 128 characters.`,
      );
    }
  }
  if (typeof input.id === 'string' && !ID.test(input.id))
    add('invalid-id', '$.id', 'Story id must be a stable ASCII identifier.');
  if (typeof input.entryDialogueId !== 'string' || !ID.test(input.entryDialogueId))
    add('entry-point', '$.entryDialogueId', 'A valid story entry dialogue id is required.');
  if (!isArray(input.dialogues) || input.dialogues.length === 0)
    add('dialogues-required', '$.dialogues', 'At least one dialogue is required.');
  if (!isArray(input.quests)) add('quests-required', '$.quests', 'Quests must be an array.');
  if (input.triggers !== undefined && !isArray(input.triggers))
    add('triggers-invalid', '$.triggers', 'Triggers must be an array when present.');

  const dialogues = (isArray(input.dialogues) ? input.dialogues : []).filter(
    isObject,
  ) as unknown as DialogueDefinition[];
  const quests = (isArray(input.quests) ? input.quests : []).filter(
    isObject,
  ) as unknown as QuestDefinition[];
  const triggers = (isArray(input.triggers) ? input.triggers : []).filter(isObject) as unknown as {
    id?: unknown;
    when?: unknown;
    effects?: unknown;
    repeatable?: unknown;
  }[];
  const questIds = new Set<string>();
  const dialogueIds = new Set<string>();
  const choiceIds = new Set<string>();
  const triggerIds = new Set<string>();
  const nodeIdsByDialogue = new Map<string, Set<string>>();

  const idField = (value: unknown, path: string): value is string => {
    if (typeof value !== 'string' || !ID.test(value)) {
      add('invalid-id', path, 'Expected a stable ASCII identifier.');
      return false;
    }
    return true;
  };
  const factKey = (value: unknown, path: string): value is string => {
    if (typeof value !== 'string' || !FACT_KEY.test(value) || UNSAFE_KEYS.has(value)) {
      add('invalid-fact-key', path, 'Fact keys must be safe stable ASCII identifiers.');
      return false;
    }
    return true;
  };
  const factTypes = new Map<string, string>();
  if (input.facts !== undefined && !isArray(input.facts)) {
    add('fact-declarations', '$.facts', 'Fact declarations must be an array when present.');
  } else if (isArray(input.facts)) {
    for (const [index, rawFact] of input.facts.entries()) {
      const path = `$.facts[${index}]`;
      if (!isObject(rawFact)) {
        add('fact-declaration', path, 'Fact declaration must be an object.');
        continue;
      }
      const keyIsValid = factKey(rawFact.key, `${path}.key`);
      const typeIsValid =
        rawFact.type === 'boolean' || rawFact.type === 'integer' || rawFact.type === 'string';
      if (!typeIsValid)
        add('fact-type', `${path}.type`, 'Fact type must be boolean, integer, or string.');
      if (keyIsValid && typeof rawFact.key === 'string') {
        if (factTypes.has(rawFact.key))
          add('duplicate-fact-key', `${path}.key`, `Fact key ${rawFact.key} is duplicated.`);
        else if (typeIsValid)
          factTypes.set(rawFact.key, rawFact.type as 'boolean' | 'integer' | 'string');
      }
      if (Object.hasOwn(rawFact, 'default') && typeIsValid) {
        const validDefault =
          (rawFact.type === 'boolean' && typeof rawFact.default === 'boolean') ||
          (rawFact.type === 'integer' &&
            typeof rawFact.default === 'number' &&
            Number.isSafeInteger(rawFact.default)) ||
          (rawFact.type === 'string' && typeof rawFact.default === 'string');
        if (!validDefault)
          add(
            'fact-default',
            `${path}.default`,
            `Default value must match the declared ${rawFact.type} fact type.`,
          );
      }
    }
  }
  if (
    input.defaultLocale !== undefined &&
    (typeof input.defaultLocale !== 'string' || !LOCALE.test(input.defaultLocale))
  )
    add('default-locale', '$.defaultLocale', 'defaultLocale must be a BCP-47-like locale tag.');
  const defaultLocale = typeof input.defaultLocale === 'string' ? input.defaultLocale : undefined;
  const factReference = (value: unknown, path: string, expectedType?: string): void => {
    if (!factKey(value, path) || !isArray(input.facts)) return;
    const actualType = factTypes.get(value);
    if (!actualType) {
      add('unknown-fact-reference', path, `Fact ${value} is not declared.`);
      return;
    }
    if (expectedType && actualType !== expectedType)
      add(
        'fact-type',
        path,
        `Fact ${value} is ${actualType}; this operation requires ${expectedType}.`,
      );
  };
  const literalFactType = (value: unknown): string | undefined => {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number' && Number.isSafeInteger(value)) return 'integer';
    return undefined;
  };
  const localized = (value: unknown, path: string): void => {
    if (!isObject(value) || Object.keys(value).length === 0) {
      add('localized-text', path, 'Text must provide at least one locale.');
      return;
    }
    for (const [locale, text] of Object.entries(value)) {
      if (!LOCALE.test(locale))
        add('locale', `${path}.${locale}`, 'Locale key must be a BCP-47-like language tag.');
      if (typeof text !== 'string' || text.length === 0)
        add('localized-text', `${path}.${locale}`, 'Localized text must be a non-empty string.');
    }
    if (defaultLocale && !Object.hasOwn(value, defaultLocale))
      add(
        'default-locale-missing',
        path,
        `Localized text must include the declared default locale ${defaultLocale}.`,
      );
  };

  const validateCondition = (raw: unknown, path: string): void => {
    if (!isObject(raw) || typeof raw.op !== 'string') {
      add('condition-shape', path, 'Condition must be an object with a supported op.');
      return;
    }
    switch (raw.op) {
      case 'flag':
        factReference(raw.key, `${path}.key`, 'boolean');
        if (typeof raw.equals !== 'boolean')
          add('condition-operand', `${path}.equals`, 'Flag equality requires a boolean.');
        break;
      case 'eq':
      case 'neq':
        factReference(raw.key, `${path}.key`);
        if (
          !(raw.value === null || ['string', 'number', 'boolean'].includes(typeof raw.value)) ||
          (typeof raw.value === 'number' && !Number.isFinite(raw.value))
        ) {
          add('condition-operand', `${path}.value`, 'Equality requires a finite JSON primitive.');
        } else if (isArray(input.facts) && typeof raw.key === 'string') {
          const expectedType = factTypes.get(raw.key);
          const actualType = literalFactType(raw.value);
          if (expectedType && expectedType !== actualType)
            add(
              'fact-type',
              `${path}.value`,
              `Condition value does not match declared ${expectedType} fact ${raw.key}.`,
            );
        }
        break;
      case 'int-gte':
      case 'int-gt':
      case 'int-lte':
      case 'int-lt':
        factReference(raw.key, `${path}.key`, 'integer');
        if (typeof raw.value !== 'number' || !Number.isSafeInteger(raw.value))
          add(
            'condition-operand',
            `${path}.value`,
            'Ordered comparisons require a safe integer; coercion is not performed.',
          );
        break;
      case 'quest-status':
        idField(raw.questId, `${path}.questId`);
        if (typeof raw.status !== 'string' || !STATUSES.has(raw.status as PersistedQuestStatus)) {
          add(
            'derived-quest-status',
            `${path}.status`,
            'Authored predicates may query persisted statuses only; locked and available are derived.',
          );
        }
        break;
      case 'quest-completed':
        idField(raw.questId, `${path}.questId`);
        break;
      case 'all':
      case 'any':
        if (!isArray(raw.conditions) || raw.conditions.length === 0)
          add(
            'condition-children',
            `${path}.conditions`,
            `${raw.op} requires at least one child condition.`,
          );
        else
          raw.conditions.forEach((child, index) =>
            validateCondition(child, `${path}.conditions[${index}]`),
          );
        break;
      case 'not':
        validateCondition(raw.condition, `${path}.condition`);
        break;
      default:
        add('unknown-condition-op', `${path}.op`, `Unknown condition operation ${raw.op}.`);
    }
  };

  const validateEffects = (raw: unknown, path: string): void => {
    if (!isArray(raw)) {
      add('effects-shape', path, 'Effects must be an ordered array.');
      return;
    }
    raw.forEach((effect, index) => {
      const effectPath = `${path}[${index}]`;
      if (!isObject(effect) || typeof effect.op !== 'string') {
        add('effect-shape', effectPath, 'Effect must be an object with a supported op.');
        return;
      }
      if (effect.op === 'set-flag') {
        factReference(effect.key, `${effectPath}.key`, 'boolean');
        if (typeof effect.value !== 'boolean')
          add('effect-operand', `${effectPath}.value`, 'set-flag requires a boolean value.');
      } else if (effect.op === 'clear-flag')
        factReference(effect.key, `${effectPath}.key`, 'boolean');
      else if (effect.op === 'clear-fact') factReference(effect.key, `${effectPath}.key`);
      else if (effect.op === 'set-fact') {
        factReference(effect.key, `${effectPath}.key`);
        if (isArray(input.facts) && typeof effect.key === 'string') {
          const expectedType = factTypes.get(effect.key);
          const actualType = literalFactType(effect.value);
          if (expectedType && expectedType !== actualType)
            add(
              'fact-type',
              `${effectPath}.value`,
              `Value does not match declared ${expectedType} fact ${effect.key}.`,
            );
        }
      } else if (effect.op === 'increment-fact') {
        factReference(effect.key, `${effectPath}.key`, 'integer');
        if (
          typeof effect.amount !== 'number' ||
          !Number.isSafeInteger(effect.amount) ||
          effect.amount === 0
        )
          add(
            'effect-operand',
            `${effectPath}.amount`,
            'increment-fact requires a non-zero safe integer.',
          );
      } else if (
        ['start-quest', 'complete-quest', 'fail-quest', 'cancel-quest'].includes(effect.op)
      )
        idField(effect.questId, `${effectPath}.questId`);
      else add('unknown-effect-op', `${effectPath}.op`, `Unknown effect operation ${effect.op}.`);
    });
  };

  for (const [index, quest] of quests.entries()) {
    const path = `$.quests[${index}]`;
    if (!idField(quest.id, `${path}.id`)) continue;
    if (questIds.has(quest.id))
      add('duplicate-quest-id', `${path}.id`, `Quest id ${quest.id} is duplicated.`);
    questIds.add(quest.id);
    if (quest.prerequisites !== undefined)
      validateCondition(quest.prerequisites, `${path}.prerequisites`);
    if (quest.restartable !== undefined && typeof quest.restartable !== 'boolean')
      add('quest-restartable', `${path}.restartable`, 'restartable must be boolean.');
    if (quest.repeatable !== undefined && typeof quest.repeatable !== 'boolean')
      add('quest-repeatable', `${path}.repeatable`, 'repeatable must be boolean.');
    if (quest.stepIds !== undefined) {
      if (!isArray(quest.stepIds)) {
        add('quest-step-ids', `${path}.stepIds`, 'stepIds must be an array when present.');
      } else {
        const stepIds = new Set<string>();
        for (const [stepIndex, stepId] of quest.stepIds.entries()) {
          const stepPath = `${path}.stepIds[${stepIndex}]`;
          if (!idField(stepId, stepPath)) continue;
          if (stepIds.has(stepId))
            add('duplicate-quest-step-id', stepPath, `Quest step id ${stepId} is duplicated.`);
          stepIds.add(stepId);
        }
      }
    }
  }

  for (const [index, dialogue] of dialogues.entries()) {
    const path = `$.dialogues[${index}]`;
    if (!idField(dialogue.id, `${path}.id`)) continue;
    if (dialogueIds.has(dialogue.id))
      add('duplicate-dialogue-id', `${path}.id`, `Dialogue id ${dialogue.id} is duplicated.`);
    dialogueIds.add(dialogue.id);
    idField(dialogue.entryNodeId, `${path}.entryNodeId`);
    if (dialogue.exitPolicy !== 'allowed' && dialogue.exitPolicy !== 'forbidden')
      add('exit-policy', `${path}.exitPolicy`, 'exitPolicy must be allowed or forbidden.');
    if (dialogue.when !== undefined) validateCondition(dialogue.when, `${path}.when`);
    if (!isArray(dialogue.nodes) || dialogue.nodes.length === 0) {
      add('dialogue-nodes', `${path}.nodes`, 'Dialogue must contain at least one node.');
      continue;
    }
    const nodeIds = new Set<string>();
    nodeIdsByDialogue.set(dialogue.id, nodeIds);
    for (const [nodeIndex, rawNode] of (dialogue.nodes as unknown[]).entries()) {
      const nodePath = `${path}.nodes[${nodeIndex}]`;
      if (!isObject(rawNode)) {
        add('node-shape', nodePath, 'Dialogue node must be an object.');
        continue;
      }
      const node = rawNode as unknown as DialogueNodeDefinition;
      if (!idField(node.id, `${nodePath}.id`)) continue;
      if (nodeIds.has(node.id))
        add(
          'duplicate-node-id',
          `${nodePath}.id`,
          `Node id ${node.id} is duplicated in this dialogue.`,
        );
      nodeIds.add(node.id);
      idField(node.speakerId, `${nodePath}.speakerId`);
      localized(node.text, `${nodePath}.text`);
      if (node.when !== undefined) validateCondition(node.when, `${nodePath}.when`);
      const hasNext = typeof node.nextNodeId === 'string';
      const hasChoices = node.choices !== undefined;
      const terminal = node.terminal === true;
      const closesDialogue = node.closesDialogue === true;
      if (Number(hasNext) + Number(hasChoices) + Number(terminal) + Number(closesDialogue) !== 1)
        add(
          'node-kind',
          nodePath,
          'A node must be exactly one of linear, choice-only, story-terminal, or dialogue-closing.',
        );
      if (hasNext) idField(node.nextNodeId, `${nodePath}.nextNodeId`);
      if (node.terminal !== undefined && typeof node.terminal !== 'boolean')
        add('node-terminal', `${nodePath}.terminal`, 'terminal must be boolean.');
      if (node.closesDialogue !== undefined && typeof node.closesDialogue !== 'boolean')
        add('node-close-dialogue', `${nodePath}.closesDialogue`, 'closesDialogue must be boolean.');
      if (closesDialogue && node.endingId !== undefined)
        add(
          'node-close-dialogue',
          `${nodePath}.endingId`,
          'A dialogue-closing node cannot assign a story ending.',
        );
      if (terminal) idField(node.endingId, `${nodePath}.endingId`);
      else if (node.endingId !== undefined)
        add('node-ending', `${nodePath}.endingId`, 'Only terminal nodes may have endingId.');
      if (node.cue !== undefined && (typeof node.cue !== 'string' || node.cue.length > 128))
        add('node-cue', `${nodePath}.cue`, 'cue must be a short string.');
      if (hasChoices) {
        if (!isArray(node.choices) || node.choices.length === 0)
          add('node-choices', `${nodePath}.choices`, 'Choice nodes require at least one choice.');
        else
          for (const [choiceIndex, choiceRaw] of (node.choices as unknown[]).entries()) {
            const choicePath = `${nodePath}.choices[${choiceIndex}]`;
            if (!isObject(choiceRaw)) {
              add('choice-shape', choicePath, 'Choice must be an object.');
              continue;
            }
            const choice = choiceRaw as Record<string, unknown>;
            if (idField(choice.id, `${choicePath}.id`)) {
              if (choiceIds.has(choice.id))
                add(
                  'duplicate-choice-id',
                  `${choicePath}.id`,
                  `Choice id ${choice.id} is duplicated across the story.`,
                );
              choiceIds.add(choice.id);
            }
            localized(choice.label, `${choicePath}.label`);
            idField(choice.targetNodeId, `${choicePath}.targetNodeId`);
            if (choice.when !== undefined) validateCondition(choice.when, `${choicePath}.when`);
            if (choice.effects !== undefined)
              validateEffects(choice.effects, `${choicePath}.effects`);
            if (choice.repeatable !== undefined && typeof choice.repeatable !== 'boolean')
              add('choice-repeatable', `${choicePath}.repeatable`, 'repeatable must be boolean.');
          }
      }
    }
  }

  for (const [index, dialogue] of dialogues.entries()) {
    const path = `$.dialogues[${index}]`;
    const nodeIds = nodeIdsByDialogue.get(dialogue.id);
    if (!nodeIds || !isArray(dialogue.nodes)) continue;
    if (!nodeIds.has(dialogue.entryNodeId))
      add(
        'missing-entry-node',
        `${path}.entryNodeId`,
        `Entry node ${dialogue.entryNodeId} does not exist.`,
      );
    const reachable = new Set<string>();
    const visit = (nodeId: string): void => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);
      const found = dialogue.nodes.find(
        (candidate) => isObject(candidate) && candidate.id === nodeId,
      );
      if (!isObject(found)) return;
      const node = found as unknown as DialogueNodeDefinition;
      if (node.nextNodeId) visit(node.nextNodeId);
      if (isArray(node.choices))
        for (const rawChoice of node.choices) {
          if (isObject(rawChoice) && typeof rawChoice.targetNodeId === 'string')
            visit(rawChoice.targetNodeId);
        }
    };
    visit(dialogue.entryNodeId);
    for (const rawNode of dialogue.nodes as unknown[]) {
      if (!isObject(rawNode)) continue;
      const node = rawNode as unknown as DialogueNodeDefinition;
      if (node.nextNodeId && !nodeIds.has(node.nextNodeId))
        add(
          'missing-node-target',
          `${path}.nodes.${node.id}.nextNodeId`,
          `Target node ${node.nextNodeId} does not exist.`,
        );
      if (isArray(node.choices))
        for (const rawChoice of node.choices as unknown[]) {
          if (!isObject(rawChoice)) continue;
          const choice = rawChoice as unknown as DialogueChoiceDefinition;
          if (typeof choice.targetNodeId === 'string' && !nodeIds.has(choice.targetNodeId))
            add(
              'missing-node-target',
              `${path}.nodes.${node.id}.choices.${choice.id}.targetNodeId`,
              `Target node ${choice.targetNodeId} does not exist.`,
            );
        }
      if (!reachable.has(node.id))
        add(
          'unreachable-node',
          `${path}.nodes.${node.id}`,
          'Node is unreachable from the dialogue entry point.',
          'warning',
        );
    }
  }

  if (typeof input.entryDialogueId === 'string' && !dialogueIds.has(input.entryDialogueId))
    add(
      'missing-entry-dialogue',
      '$.entryDialogueId',
      `Entry dialogue ${input.entryDialogueId} does not exist.`,
    );
  for (const dialogue of dialogues) {
    if (!isArray(dialogue.nodes)) continue;
    for (const rawNode of dialogue.nodes as unknown[]) {
      if (!isObject(rawNode) || !isArray(rawNode.choices)) continue;
      for (const rawChoice of rawNode.choices) {
        if (!isObject(rawChoice) || !isArray(rawChoice.effects)) continue;
        for (const effect of rawChoice.effects)
          validateEffectReference(
            effect,
            `$.dialogues.${dialogue.id}.nodes.${String(rawNode.id)}.choices.${String(rawChoice.id)}.effects`,
          );
      }
    }
  }
  for (const [index, trigger] of triggers.entries()) {
    const path = `$.triggers[${index}]`;
    if (typeof trigger.id !== 'string' || !ID.test(trigger.id))
      add('invalid-id', `${path}.id`, 'Expected a stable ASCII identifier.');
    else if (triggerIds.has(trigger.id))
      add('duplicate-trigger-id', `${path}.id`, `Trigger id ${trigger.id} is duplicated.`);
    else triggerIds.add(trigger.id);
    if (trigger.when !== undefined) validateCondition(trigger.when, `${path}.when`);
    validateEffects(trigger.effects, `${path}.effects`);
    if (isArray(trigger.effects) && trigger.effects.length === 0)
      add(
        'empty-trigger-effects',
        `${path}.effects`,
        'A trigger must declare at least one effect.',
      );
    if (trigger.repeatable !== undefined && typeof trigger.repeatable !== 'boolean')
      add('trigger-repeatable', `${path}.repeatable`, 'repeatable must be boolean.');
    if (isArray(trigger.effects))
      for (const effect of trigger.effects) validateEffectReference(effect, `${path}.effects`);
  }
  for (const dialogue of dialogues) {
    if (!isArray(dialogue.nodes)) continue;
    if (dialogue.when)
      validateConditionReferences(dialogue.when, `$.dialogues.${dialogue.id}.when`);
    for (const rawNode of dialogue.nodes as unknown[]) {
      if (!isObject(rawNode)) continue;
      const node = rawNode as unknown as DialogueNodeDefinition;
      if (node.when)
        validateConditionReferences(node.when, `$.dialogues.${dialogue.id}.nodes.${node.id}.when`);
      if (isArray(node.choices))
        for (const rawChoice of node.choices as unknown[]) {
          if (!isObject(rawChoice)) continue;
          const choice = rawChoice as unknown as DialogueChoiceDefinition;
          if (choice.when)
            validateConditionReferences(
              choice.when,
              `$.dialogues.${dialogue.id}.nodes.${node.id}.choices.${choice.id}.when`,
            );
        }
    }
  }
  for (const quest of quests)
    if (quest.prerequisites)
      validateConditionReferences(quest.prerequisites, `$.quests.${quest.id}.prerequisites`);
  for (const trigger of triggers)
    if (trigger.when)
      validateConditionReferences(
        trigger.when as NarrativeCondition,
        `$.triggers.${trigger.id}.when`,
      );

  const mandatoryEdges = new Map<string, Set<string>>();
  const possibleEdges = new Map<string, Set<string>>();
  for (const quest of quests) {
    if (typeof quest.id !== 'string') continue;
    const allDependencies = quest.prerequisites
      ? questDependencies(quest.prerequisites, false)
      : new Set<string>();
    const mandatory = quest.prerequisites
      ? questDependencies(quest.prerequisites, true)
      : new Set<string>();
    mandatoryEdges.set(quest.id, mandatory);
    possibleEdges.set(quest.id, allDependencies);
    for (const dependency of allDependencies)
      if (!questIds.has(dependency))
        add(
          'unknown-quest-reference',
          `$.quests.${quest.id}.prerequisites`,
          `Condition references unknown quest ${dependency}.`,
        );
  }
  for (const component of stronglyConnected(mandatoryEdges)) {
    if (component.length > 1 || mandatoryEdges.get(component[0]!)?.has(component[0]!))
      add(
        'quest-prerequisite-cycle',
        '$.quests',
        `Unconditional active-status prerequisite cycle cannot start: ${component.join(' → ')}.`,
      );
  }
  for (const component of stronglyConnected(possibleEdges)) {
    if (
      (component.length > 1 || possibleEdges.get(component[0]!)?.has(component[0]!)) &&
      !stronglyConnectedHasSame(mandatoryEdges, component)
    )
      add(
        'conditional-quest-cycle',
        '$.quests',
        `Quest prerequisite cycle may depend on conditions and cannot be proven satisfiable statically: ${component.join(' → ')}.`,
        'warning',
      );
  }
  return report(diagnostics);

  function validateEffectReference(effect: NarrativeEffect | unknown, path: string): void {
    if (
      isObject(effect) &&
      typeof effect.op === 'string' &&
      ['start-quest', 'complete-quest', 'fail-quest', 'cancel-quest'].includes(effect.op)
    ) {
      if (typeof effect.questId === 'string' && !questIds.has(effect.questId))
        add('unknown-quest-reference', path, `Effect references unknown quest ${effect.questId}.`);
    }
  }
  function validateConditionReferences(condition: NarrativeCondition, path: string): void {
    if (!isObject(condition)) return;
    if (
      (condition.op === 'quest-status' || condition.op === 'quest-completed') &&
      !questIds.has(condition.questId)
    )
      add(
        'unknown-quest-reference',
        path,
        `Condition references unknown quest ${condition.questId}.`,
      );
    else if ((condition.op === 'all' || condition.op === 'any') && isArray(condition.conditions))
      condition.conditions.forEach((child, index) =>
        validateConditionReferences(child, `${path}.conditions[${index}]`),
      );
    else if (condition.op === 'not')
      validateConditionReferences(condition.condition, `${path}.condition`);
  }
}

function report(diagnostics: NarrativeDiagnostic[]): NarrativeValidationReport {
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
  return {
    diagnostics,
    errorCount,
    warningCount: diagnostics.length - errorCount,
    ok: errorCount === 0,
  };
}

function questDependencies(condition: NarrativeCondition, mandatory: boolean): Set<string> {
  if (!isObject(condition)) return new Set();
  if (condition.op === 'quest-completed') return new Set([condition.questId]);
  if (condition.op === 'quest-status' && STATUSES.has(condition.status))
    return new Set([condition.questId]);
  if (condition.op === 'not') return new Set();
  if (condition.op === 'all' && isArray(condition.conditions))
    return union(condition.conditions.map((child) => questDependencies(child, mandatory)));
  if (condition.op === 'any' && isArray(condition.conditions)) {
    if (!mandatory)
      return union(condition.conditions.map((child) => questDependencies(child, false)));
    return intersection(condition.conditions.map((child) => questDependencies(child, true)));
  }
  return new Set();
}

function union(sets: Set<string>[]): Set<string> {
  return new Set(sets.flatMap((set) => [...set]));
}

function intersection(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  return new Set([...sets[0]!].filter((value) => sets.every((set) => set.has(value))));
}

function stronglyConnected(graph: Map<string, Set<string>>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const components: string[][] = [];
  const visit = (node: string): void => {
    indices.set(node, index);
    low.set(node, index++);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (!indices.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) low.set(node, Math.min(low.get(node)!, indices.get(next)!));
    }
    if (low.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    let value: string;
    do {
      value = stack.pop()!;
      onStack.delete(value);
      component.push(value);
    } while (value !== node);
    components.push(component);
  };
  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return components;
}

function stronglyConnectedHasSame(graph: Map<string, Set<string>>, component: string[]): boolean {
  const members = new Set(component);
  const seen = new Set<string>();
  const visit = (node: string): boolean => {
    if (seen.has(node)) return false;
    seen.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!members.has(next)) continue;
      if (next === component[0] || visit(next)) return true;
    }
    return false;
  };
  return component.some((node) => visit(node));
}
