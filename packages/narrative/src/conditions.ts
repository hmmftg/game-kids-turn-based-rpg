import type {
  JsonPrimitive,
  NarrativeCondition,
  NarrativeState,
  PersistedQuestStatus,
} from './definition.js';

const PERSISTED_STATUSES = new Set<PersistedQuestStatus>([
  'active',
  'completed',
  'failed',
  'cancelled',
]);

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface Evaluation {
  readonly valid: boolean;
  readonly value: boolean;
}

function evaluate(condition: unknown, state: NarrativeState): Evaluation {
  if (!record(condition) || typeof condition.op !== 'string') return { valid: false, value: false };
  const facts = record(state.facts) ? state.facts : {};
  switch (condition.op) {
    case 'flag': {
      if (typeof condition.key !== 'string' || typeof condition.equals !== 'boolean')
        return { valid: false, value: false };
      if (!Object.hasOwn(facts, condition.key)) return { valid: true, value: false };
      const value = facts[condition.key];
      return typeof value === 'boolean'
        ? { valid: true, value: value === condition.equals }
        : { valid: true, value: false };
    }
    case 'eq':
    case 'neq': {
      if (typeof condition.key !== 'string' || !isJsonPrimitive(condition.value))
        return { valid: false, value: false };
      if (!Object.hasOwn(facts, condition.key)) return { valid: true, value: false };
      const equal = facts[condition.key] === condition.value;
      return { valid: true, value: condition.op === 'eq' ? equal : !equal };
    }
    case 'int-gte':
    case 'int-gt':
    case 'int-lte':
    case 'int-lt': {
      if (
        typeof condition.key !== 'string' ||
        typeof condition.value !== 'number' ||
        !Number.isSafeInteger(condition.value)
      )
        return { valid: false, value: false };
      const current = facts[condition.key];
      if (typeof current !== 'number' || !Number.isSafeInteger(current))
        return { valid: true, value: false };
      if (condition.op === 'int-gte') return { valid: true, value: current >= condition.value };
      if (condition.op === 'int-gt') return { valid: true, value: current > condition.value };
      if (condition.op === 'int-lte') return { valid: true, value: current <= condition.value };
      return { valid: true, value: current < condition.value };
    }
    case 'quest-status': {
      if (
        typeof condition.questId !== 'string' ||
        typeof condition.status !== 'string' ||
        !PERSISTED_STATUSES.has(condition.status as PersistedQuestStatus)
      ) {
        return { valid: false, value: false };
      }
      return {
        valid: true,
        value: record(state.quests) && state.quests[condition.questId] === condition.status,
      };
    }
    case 'quest-completed': {
      if (typeof condition.questId !== 'string') return { valid: false, value: false };
      const history = record(state.questHistory)
        ? state.questHistory[condition.questId]
        : undefined;
      return {
        valid: true,
        value:
          (record(history) &&
            typeof history.completionCount === 'number' &&
            history.completionCount > 0) ||
          (record(state.quests) && state.quests[condition.questId] === 'completed'),
      };
    }
    case 'not': {
      const child = evaluate(condition.condition, state);
      return child.valid ? { valid: true, value: !child.value } : { valid: false, value: false };
    }
    case 'all':
    case 'any': {
      if (!Array.isArray(condition.conditions) || condition.conditions.length === 0)
        return { valid: false, value: false };
      const children = condition.conditions.map((child) => evaluate(child, state));
      if (children.some((child) => !child.valid)) return { valid: false, value: false };
      return {
        valid: true,
        value:
          condition.op === 'all'
            ? children.every((child) => child.value)
            : children.some((child) => child.value),
      };
    }
    default:
      return { valid: false, value: false };
  }
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Invalid expressions evaluate false; no coercion or dynamic execution occurs. */
export function evaluateCondition(condition: NarrativeCondition, state: NarrativeState): boolean {
  const result = evaluate(condition, state);
  return result.valid && result.value;
}
