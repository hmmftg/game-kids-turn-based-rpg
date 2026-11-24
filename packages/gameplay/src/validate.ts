import type { GameplayDiagnostic, GameplayValidationReport } from './definition.js';

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const MAX_DEFINITION_INTEGER = 1_000_000;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function validateJsonTree(
  value: unknown,
  path: string,
  diagnostics: GameplayDiagnostic[],
): boolean {
  const ancestors = new WeakSet<object>();
  const visit = (current: unknown, currentPath: string): boolean => {
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean' ||
      (typeof current === 'number' && Number.isFinite(current))
    )
      return true;
    if (typeof current !== 'object') {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-json',
        path: currentPath,
        message: 'Definition values must be finite JSON primitives, arrays, or plain objects.',
      });
      return false;
    }
    if (ancestors.has(current)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-json',
        path: currentPath,
        message: 'Definition data cannot contain cycles.',
      });
      return false;
    }
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-json',
          path: currentPath,
          message: 'Definition arrays must use the standard array prototype.',
        });
        return false;
      }
      const arrayKeys = Reflect.ownKeys(current);
      if (
        arrayKeys.some(
          (key) =>
            typeof key === 'symbol' ||
            (key !== 'length' &&
              (!/^\d+$/.test(key) || Number(key) >= current.length || String(Number(key)) !== key)),
        )
      ) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-json',
          path: currentPath,
          message: 'Arrays cannot have symbol or non-index properties.',
        });
        return false;
      }
      ancestors.add(current);
      let valid = true;
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          diagnostics.push({
            severity: 'error',
            code: 'invalid-json',
            path: `${currentPath}[${index}]`,
            message: 'Sparse arrays and accessor properties are not valid definition data.',
          });
          valid = false;
          continue;
        }
        valid = visit(descriptor.value, `${currentPath}[${index}]`) && valid;
      }
      ancestors.delete(current);
      return valid;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-json',
        path: currentPath,
        message: 'Definition objects must be plain JSON objects.',
      });
      return false;
    }
    const ownKeys = Reflect.ownKeys(current);
    if (
      ownKeys.some(
        (key) =>
          typeof key === 'symbol' ||
          (typeof key === 'string' && !Object.prototype.propertyIsEnumerable.call(current, key)),
      )
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-json',
        path: currentPath,
        message: 'Only enumerable string-keyed data properties are valid definition data.',
      });
      return false;
    }
    ancestors.add(current);
    let valid = true;
    for (const key of Object.keys(current)) {
      const propertyPath = `${currentPath}.${key}`;
      if (UNSAFE_KEYS.has(key)) {
        diagnostics.push({
          severity: 'error',
          code: 'unsafe-key',
          path: propertyPath,
          message: 'Prototype-related object keys are not allowed.',
        });
        valid = false;
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !('value' in descriptor)) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-json',
          path: propertyPath,
          message: 'Accessor properties are not valid definition data.',
        });
        valid = false;
        continue;
      }
      valid = visit(descriptor.value, propertyPath) && valid;
    }
    ancestors.delete(current);
    return valid;
  };
  return visit(value, path);
}

function report(diagnostics: GameplayDiagnostic[]): GameplayValidationReport {
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item))),
    errorCount,
    warningCount: diagnostics.length - errorCount,
    ok: errorCount === 0,
  });
}

function addError(
  diagnostics: GameplayDiagnostic[],
  code: string,
  path: string,
  message: string,
): void {
  diagnostics.push({ severity: 'error', code, path, message });
}

function requireString(
  value: unknown,
  path: string,
  diagnostics: GameplayDiagnostic[],
  code = 'invalid-identifier',
): value is string {
  if (isIdentifier(value)) return true;
  addError(
    diagnostics,
    code,
    path,
    'Expected a stable identifier using letters, digits, dot, colon, dash, or underscore.',
  );
  return false;
}

function requireInteger(
  value: unknown,
  path: string,
  diagnostics: GameplayDiagnostic[],
  minimum: number,
  maximum = MAX_DEFINITION_INTEGER,
): value is number {
  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
    return true;
  addError(
    diagnostics,
    'invalid-number',
    path,
    `Expected a safe integer from ${minimum} through ${maximum}.`,
  );
  return false;
}

function recordsById(
  value: unknown,
  path: string,
  diagnostics: GameplayDiagnostic[],
): Map<string, UnknownRecord> {
  if (!Array.isArray(value)) {
    addError(diagnostics, 'invalid-shape', path, 'Expected an array of definitions.');
    return new Map();
  }
  const result = new Map<string, UnknownRecord>();
  value.forEach((entry, index) => {
    const rowPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      addError(diagnostics, 'invalid-shape', rowPath, 'Expected a definition object.');
      return;
    }
    if (!requireString(entry.id, `${rowPath}.id`, diagnostics)) return;
    if (result.has(entry.id))
      addError(
        diagnostics,
        'duplicate-id',
        `${rowPath}.id`,
        `Duplicate identifier "${entry.id}" in ${path}.`,
      );
    else result.set(entry.id, entry);
  });
  return result;
}

function requireRecord(
  value: unknown,
  path: string,
  diagnostics: GameplayDiagnostic[],
): UnknownRecord {
  if (isRecord(value)) return value;
  addError(diagnostics, 'invalid-shape', path, 'Expected an object keyed by stable identifiers.');
  return {};
}

function checkReference(
  value: unknown,
  table: ReadonlyMap<string, UnknownRecord>,
  path: string,
  diagnostics: GameplayDiagnostic[],
): void {
  if (requireString(value, path, diagnostics) && !table.has(value))
    addError(diagnostics, 'missing-reference', path, `No definition exists for "${value}".`);
}

function validateRequirements(
  value: unknown,
  path: string,
  attributes: ReadonlyMap<string, UnknownRecord>,
  diagnostics: GameplayDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    addError(diagnostics, 'invalid-shape', path, 'Expected an array of attribute requirements.');
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      addError(
        diagnostics,
        'invalid-shape',
        entryPath,
        'Expected an attribute requirement object.',
      );
      return;
    }
    checkReference(entry.attributeId, attributes, `${entryPath}.attributeId`, diagnostics);
    requireInteger(entry.minimum, `${entryPath}.minimum`, diagnostics, -MAX_DEFINITION_INTEGER);
  });
}

function validateModifiers(
  value: unknown,
  path: string,
  attributes: ReadonlyMap<string, UnknownRecord>,
  diagnostics: GameplayDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    addError(diagnostics, 'invalid-shape', path, 'Expected an array of stat modifiers.');
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      addError(diagnostics, 'invalid-shape', entryPath, 'Expected a stat modifier object.');
      return;
    }
    checkReference(entry.attributeId, attributes, `${entryPath}.attributeId`, diagnostics);
    requireInteger(
      entry.amount,
      `${entryPath}.amount`,
      diagnostics,
      -MAX_DEFINITION_INTEGER,
      MAX_DEFINITION_INTEGER,
    );
  });
}

function cellKey(cell: UnknownRecord): string {
  return `${String(cell.x)},${String(cell.y)}`;
}

function validateCell(
  value: unknown,
  path: string,
  diagnostics: GameplayDiagnostic[],
  width?: number,
  height?: number,
): value is UnknownRecord {
  if (!isRecord(value)) {
    addError(diagnostics, 'invalid-shape', path, 'Expected an integer grid cell.');
    return false;
  }
  const xOk = requireInteger(
    value.x,
    `${path}.x`,
    diagnostics,
    0,
    width === undefined ? MAX_DEFINITION_INTEGER : width - 1,
  );
  const yOk = requireInteger(
    value.y,
    `${path}.y`,
    diagnostics,
    0,
    height === undefined ? MAX_DEFINITION_INTEGER : height - 1,
  );
  return xOk && yOk;
}

function validateRewardBundle(
  value: unknown,
  path: string,
  characters: ReadonlyMap<string, UnknownRecord>,
  playerCharacterIds: ReadonlySet<string>,
  items: ReadonlyMap<string, UnknownRecord>,
  slots: ReadonlyMap<string, UnknownRecord>,
  diagnostics: GameplayDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addError(diagnostics, 'invalid-shape', path, 'Expected a reward bundle.');
    return;
  }
  const experience = value.experience;
  if (experience !== undefined) {
    if (!Array.isArray(experience))
      addError(diagnostics, 'invalid-shape', `${path}.experience`, 'Expected an array.');
    else {
      const awarded = new Set<string>();
      experience.forEach((entry, index) => {
        const entryPath = `${path}.experience[${index}]`;
        if (!isRecord(entry)) {
          addError(diagnostics, 'invalid-shape', entryPath, 'Expected an experience reward.');
          return;
        }
        checkReference(entry.characterId, characters, `${entryPath}.characterId`, diagnostics);
        if (typeof entry.characterId === 'string') {
          if (!playerCharacterIds.has(entry.characterId))
            addError(
              diagnostics,
              'reward-owner',
              `${entryPath}.characterId`,
              'Experience rewards may target only a player participant.',
            );
          if (awarded.has(entry.characterId))
            addError(
              diagnostics,
              'duplicate-reward',
              `${entryPath}.characterId`,
              'Combine experience into one row per character.',
            );
          awarded.add(entry.characterId);
        }
        requireInteger(entry.amount, `${entryPath}.amount`, diagnostics, 1);
      });
    }
  }
  const itemRows = new Map<string, number>();
  if (value.items !== undefined) {
    if (!Array.isArray(value.items))
      addError(diagnostics, 'invalid-shape', `${path}.items`, 'Expected an array.');
    else
      value.items.forEach((entry, index) => {
        const entryPath = `${path}.items[${index}]`;
        if (!isRecord(entry)) {
          addError(diagnostics, 'invalid-shape', entryPath, 'Expected an item reward.');
          return;
        }
        checkReference(entry.itemId, items, `${entryPath}.itemId`, diagnostics);
        const quantityOk = requireInteger(entry.quantity, `${entryPath}.quantity`, diagnostics, 1);
        if (typeof entry.itemId === 'string' && quantityOk && typeof entry.quantity === 'number') {
          itemRows.set(entry.itemId, (itemRows.get(entry.itemId) ?? 0) + entry.quantity);
          const item = items.get(entry.itemId);
          if (item?.unique === true && entry.quantity !== 1)
            addError(
              diagnostics,
              'unique-item-quantity',
              `${entryPath}.quantity`,
              'Unique rewards must have quantity one.',
            );
        }
      });
  }
  const equipment = value.equipment;
  if (equipment !== undefined) {
    if (!Array.isArray(equipment))
      addError(diagnostics, 'invalid-shape', `${path}.equipment`, 'Expected an array.');
    else {
      const assignedSlots = new Set<string>();
      equipment.forEach((entry, index) => {
        const entryPath = `${path}.equipment[${index}]`;
        if (!isRecord(entry)) {
          addError(diagnostics, 'invalid-shape', entryPath, 'Expected an equipment reward.');
          return;
        }
        checkReference(entry.characterId, characters, `${entryPath}.characterId`, diagnostics);
        checkReference(entry.itemId, items, `${entryPath}.itemId`, diagnostics);
        checkReference(entry.slotId, slots, `${entryPath}.slotId`, diagnostics);
        if (typeof entry.characterId === 'string' && !playerCharacterIds.has(entry.characterId))
          addError(
            diagnostics,
            'reward-owner',
            `${entryPath}.characterId`,
            'Equipment rewards may target only a player participant.',
          );
        if (typeof entry.characterId === 'string' && typeof entry.slotId === 'string') {
          const key = `${entry.characterId}:${entry.slotId}`;
          if (assignedSlots.has(key))
            addError(
              diagnostics,
              'duplicate-reward',
              `${entryPath}.slotId`,
              'A reward bundle can assign each character slot only once.',
            );
          assignedSlots.add(key);
        }
        const item = typeof entry.itemId === 'string' ? items.get(entry.itemId) : undefined;
        if (
          !isRecord(item?.equipment) ||
          item.equipment.slotId !== entry.slotId ||
          typeof entry.itemId !== 'string' ||
          (itemRows.get(entry.itemId) ?? 0) < 1
        )
          addError(
            diagnostics,
            'reward-equipment',
            entryPath,
            'An equipment reward must reference a compatible item included in the same reward bundle.',
          );
      });
    }
  }
}

/** Validate JSON safety, schema references, and bounded deterministic authoring values. */
export function validateGameplay(input: unknown): GameplayValidationReport {
  const diagnostics: GameplayDiagnostic[] = [];
  const jsonSafe = validateJsonTree(input, '$', diagnostics);
  if (!jsonSafe) return report(diagnostics);
  if (!isRecord(input)) {
    addError(diagnostics, 'invalid-shape', '$', 'Expected a gameplay definition object.');
    return report(diagnostics);
  }

  if (input.schemaVersion !== 1)
    addError(
      diagnostics,
      'unsupported-schema',
      '$.schemaVersion',
      'Only gameplay definition schema version 1 is supported.',
    );
  requireString(input.id, '$.id', diagnostics);
  for (const key of ['contentVersion', 'compatibilityVersion']) {
    if (typeof input[key] !== 'string' || input[key].length === 0)
      addError(diagnostics, 'invalid-version', `$.${key}`, 'Expected a non-empty version string.');
  }
  if (input.inventoryCapacity !== undefined)
    requireInteger(
      input.inventoryCapacity,
      '$.inventoryCapacity',
      diagnostics,
      1,
      MAX_DEFINITION_INTEGER,
    );

  const attributes = recordsById(input.attributes, '$.attributes', diagnostics);
  const resources = recordsById(input.resources, '$.resources', diagnostics);
  const characters = recordsById(input.characters, '$.characters', diagnostics);
  const items = recordsById(input.items, '$.items', diagnostics);
  const slots = recordsById(input.equipmentSlots, '$.equipmentSlots', diagnostics);
  const abilities = recordsById(input.abilities, '$.abilities', diagnostics);
  const statuses = recordsById(input.statusEffects, '$.statusEffects', diagnostics);
  const boards = recordsById(input.boards, '$.boards', diagnostics);
  const encounters = recordsById(input.encounters, '$.encounters', diagnostics);

  checkReference(input.movementAttributeId, attributes, '$.movementAttributeId', diagnostics);
  const movementAttribute =
    typeof input.movementAttributeId === 'string'
      ? attributes.get(input.movementAttributeId)
      : undefined;
  if (
    movementAttribute &&
    (typeof movementAttribute.minimum !== 'number' || movementAttribute.minimum < 1)
  )
    addError(
      diagnostics,
      'movement-attribute',
      '$.movementAttributeId',
      'Movement must use an attribute whose minimum is at least one step.',
    );
  checkReference(input.healthResourceId, resources, '$.healthResourceId', diagnostics);

  for (const [id, attribute] of attributes) {
    const minimum = attribute.minimum;
    const maximum = attribute.maximum;
    const defaultValue = attribute.defaultValue;
    const minOk = requireInteger(
      minimum,
      `$.attributes.${id}.minimum`,
      diagnostics,
      -MAX_DEFINITION_INTEGER,
    );
    const maxOk = requireInteger(
      maximum,
      `$.attributes.${id}.maximum`,
      diagnostics,
      -MAX_DEFINITION_INTEGER,
    );
    const defaultOk = requireInteger(
      defaultValue,
      `$.attributes.${id}.defaultValue`,
      diagnostics,
      -MAX_DEFINITION_INTEGER,
    );
    if (
      minOk &&
      maxOk &&
      typeof minimum === 'number' &&
      typeof maximum === 'number' &&
      minimum > maximum
    )
      addError(
        diagnostics,
        'attribute-range',
        `$.attributes.${id}`,
        'Attribute minimum cannot exceed its maximum.',
      );
    if (
      minOk &&
      maxOk &&
      defaultOk &&
      typeof minimum === 'number' &&
      typeof maximum === 'number' &&
      typeof defaultValue === 'number' &&
      (defaultValue < minimum || defaultValue > maximum)
    )
      addError(
        diagnostics,
        'attribute-default',
        `$.attributes.${id}.defaultValue`,
        'Default attribute value must be within its declared bounds.',
      );
  }
  for (const [id, resource] of resources) {
    const maximum = resource.maximum;
    const defaultValue = resource.defaultValue;
    const maxOk = requireInteger(maximum, `$.resources.${id}.maximum`, diagnostics, 1);
    const defaultOk = requireInteger(
      defaultValue,
      `$.resources.${id}.defaultValue`,
      diagnostics,
      0,
    );
    if (
      maxOk &&
      defaultOk &&
      typeof maximum === 'number' &&
      typeof defaultValue === 'number' &&
      defaultValue > maximum
    )
      addError(
        diagnostics,
        'resource-default',
        `$.resources.${id}.defaultValue`,
        'Default resource value cannot exceed its maximum.',
      );
  }

  if (!isRecord(input.progression)) {
    addError(diagnostics, 'invalid-shape', '$.progression', 'Expected a progression definition.');
  } else {
    const progression = input.progression;
    const maxLevel = progression.maxLevel;
    const maxLevelOk = requireInteger(maxLevel, '$.progression.maxLevel', diagnostics, 1, 100);
    const thresholds = progression.experienceThresholds;
    if (!Array.isArray(thresholds))
      addError(
        diagnostics,
        'invalid-shape',
        '$.progression.experienceThresholds',
        'Expected an array of cumulative experience thresholds.',
      );
    else {
      let previous = 0;
      thresholds.forEach((threshold, index) => {
        const valid = requireInteger(
          threshold,
          `$.progression.experienceThresholds[${index}]`,
          diagnostics,
          1,
        );
        if (valid && threshold <= previous)
          addError(
            diagnostics,
            'progression-thresholds',
            `$.progression.experienceThresholds[${index}]`,
            'Experience thresholds must be strictly increasing.',
          );
        if (valid) previous = threshold;
      });
      if (maxLevelOk && typeof maxLevel === 'number' && thresholds.length !== maxLevel - 1)
        addError(
          diagnostics,
          'progression-thresholds',
          '$.progression.experienceThresholds',
          'Provide exactly one threshold for each level after level one.',
        );
    }
    const unlocks = progression.abilityUnlocks;
    if (unlocks !== undefined) {
      if (!Array.isArray(unlocks))
        addError(
          diagnostics,
          'invalid-shape',
          '$.progression.abilityUnlocks',
          'Expected an array of ability unlocks.',
        );
      else {
        const seen = new Set<string>();
        unlocks.forEach((entry, index) => {
          const unlockPath = `$.progression.abilityUnlocks[${index}]`;
          if (!isRecord(entry)) {
            addError(diagnostics, 'invalid-shape', unlockPath, 'Expected an ability unlock.');
            return;
          }
          const levelOk = requireInteger(
            entry.level,
            `${unlockPath}.level`,
            diagnostics,
            1,
            maxLevelOk && typeof maxLevel === 'number' ? maxLevel : 100,
          );
          checkReference(entry.abilityId, abilities, `${unlockPath}.abilityId`, diagnostics);
          if (typeof entry.abilityId === 'string') {
            if (seen.has(entry.abilityId))
              addError(
                diagnostics,
                'duplicate-unlock',
                `${unlockPath}.abilityId`,
                'An ability may be unlocked only once.',
              );
            seen.add(entry.abilityId);
          }
          if (
            levelOk &&
            maxLevelOk &&
            typeof entry.level === 'number' &&
            typeof maxLevel === 'number' &&
            entry.level > maxLevel
          )
            addError(
              diagnostics,
              'progression-unlock',
              `${unlockPath}.level`,
              'Ability unlock level exceeds the progression cap.',
            );
        });
      }
    }
  }

  for (const [id, character] of characters) {
    const base = requireRecord(
      character.baseAttributes,
      `$.characters.${id}.baseAttributes`,
      diagnostics,
    );
    for (const [attributeId, attributeValue] of Object.entries(base)) {
      const attribute = attributes.get(attributeId);
      if (!attribute)
        addError(
          diagnostics,
          'missing-reference',
          `$.characters.${id}.baseAttributes.${attributeId}`,
          `No attribute exists for "${attributeId}".`,
        );
      const valid = requireInteger(
        attributeValue,
        `$.characters.${id}.baseAttributes.${attributeId}`,
        diagnostics,
        -MAX_DEFINITION_INTEGER,
      );
      if (
        attribute &&
        valid &&
        (attributeValue < (attribute.minimum as number) ||
          attributeValue > (attribute.maximum as number))
      )
        addError(
          diagnostics,
          'attribute-range',
          `$.characters.${id}.baseAttributes.${attributeId}`,
          'Character base attribute is outside the declared bounds.',
        );
    }
    for (const attributeId of attributes.keys())
      if (!Object.hasOwn(base, attributeId))
        addError(
          diagnostics,
          'missing-attribute',
          `$.characters.${id}.baseAttributes.${attributeId}`,
          'Every character must declare a base value for each attribute.',
        );

    const startingResources = character.startingResources;
    if (startingResources !== undefined) {
      const values = requireRecord(
        startingResources,
        `$.characters.${id}.startingResources`,
        diagnostics,
      );
      for (const [resourceId, amount] of Object.entries(values)) {
        const resource = resources.get(resourceId);
        if (!resource)
          addError(
            diagnostics,
            'missing-reference',
            `$.characters.${id}.startingResources.${resourceId}`,
            `No resource exists for "${resourceId}".`,
          );
        const valid = requireInteger(
          amount,
          `$.characters.${id}.startingResources.${resourceId}`,
          diagnostics,
          0,
        );
        if (resource && valid && amount > (resource.maximum as number))
          addError(
            diagnostics,
            'resource-default',
            `$.characters.${id}.startingResources.${resourceId}`,
            'Starting resource exceeds its maximum.',
          );
      }
    }
    const startingAbilities = character.startingAbilityIds ?? [];
    if (!Array.isArray(startingAbilities))
      addError(
        diagnostics,
        'invalid-shape',
        `$.characters.${id}.startingAbilityIds`,
        'Expected an array of ability identifiers.',
      );
    else
      startingAbilities.forEach((abilityId, index) =>
        checkReference(
          abilityId,
          abilities,
          `$.characters.${id}.startingAbilityIds[${index}]`,
          diagnostics,
        ),
      );
  }

  for (const [id, item] of items) {
    const stackOk = requireInteger(
      item.stackLimit,
      `$.items.${id}.stackLimit`,
      diagnostics,
      1,
      9999,
    );
    if (item.unique === true && stackOk && item.stackLimit !== 1)
      addError(
        diagnostics,
        'unique-stack',
        `$.items.${id}.stackLimit`,
        'Unique items must have a stack limit of one.',
      );
    if (item.equipment !== undefined) {
      if (!isRecord(item.equipment)) {
        addError(
          diagnostics,
          'invalid-shape',
          `$.items.${id}.equipment`,
          'Expected equipment item metadata.',
        );
        continue;
      }
      checkReference(item.equipment.slotId, slots, `$.items.${id}.equipment.slotId`, diagnostics);
      validateRequirements(
        item.equipment.requirements,
        `$.items.${id}.equipment.requirements`,
        attributes,
        diagnostics,
      );
      validateModifiers(
        item.equipment.modifiers,
        `$.items.${id}.equipment.modifiers`,
        attributes,
        diagnostics,
      );
      const granted = item.equipment.grantedAbilityIds;
      if (granted !== undefined) {
        if (!Array.isArray(granted))
          addError(
            diagnostics,
            'invalid-shape',
            `$.items.${id}.equipment.grantedAbilityIds`,
            'Expected an array.',
          );
        else
          granted.forEach((abilityId, index) =>
            checkReference(
              abilityId,
              abilities,
              `$.items.${id}.equipment.grantedAbilityIds[${index}]`,
              diagnostics,
            ),
          );
      }
    }
  }

  for (const [id, ability] of abilities) {
    const costs = requireRecord(
      ability.resourceCosts,
      `$.abilities.${id}.resourceCosts`,
      diagnostics,
    );
    for (const [resourceId, amount] of Object.entries(costs)) {
      checkReference(
        resourceId,
        resources,
        `$.abilities.${id}.resourceCosts.${resourceId}`,
        diagnostics,
      );
      requireInteger(amount, `$.abilities.${id}.resourceCosts.${resourceId}`, diagnostics, 0);
    }
    if (!isRecord(ability.target))
      addError(
        diagnostics,
        'invalid-shape',
        `$.abilities.${id}.target`,
        'Expected an ability target rule.',
      );
    else {
      const minimumRange = ability.target.minimumRange;
      const maximumRange = ability.target.maximumRange;
      const minOk = requireInteger(
        minimumRange,
        `$.abilities.${id}.target.minimumRange`,
        diagnostics,
        0,
        64,
      );
      const maxOk = requireInteger(
        maximumRange,
        `$.abilities.${id}.target.maximumRange`,
        diagnostics,
        0,
        64,
      );
      if (
        minOk &&
        maxOk &&
        typeof minimumRange === 'number' &&
        typeof maximumRange === 'number' &&
        minimumRange > maximumRange
      )
        addError(
          diagnostics,
          'ability-range',
          `$.abilities.${id}.target`,
          'Minimum range cannot exceed maximum range.',
        );
      if (!['self', 'ally', 'enemy', 'cell'].includes(String(ability.target.kind)))
        addError(
          diagnostics,
          'invalid-target-kind',
          `$.abilities.${id}.target.kind`,
          'Unknown ability target kind.',
        );
      if (ability.target.kind === 'self' && (minimumRange !== 0 || maximumRange !== 0))
        addError(
          diagnostics,
          'ability-range',
          `$.abilities.${id}.target`,
          'Self-targeted abilities must use range zero.',
        );
    }
    validateRequirements(
      ability.requirements,
      `$.abilities.${id}.requirements`,
      attributes,
      diagnostics,
    );
    if (ability.cooldownTurns !== undefined)
      requireInteger(
        ability.cooldownTurns,
        `$.abilities.${id}.cooldownTurns`,
        diagnostics,
        0,
        10_000,
      );
    if (!Array.isArray(ability.effects) || ability.effects.length === 0)
      addError(
        diagnostics,
        'invalid-shape',
        `$.abilities.${id}.effects`,
        'An ability must declare at least one effect.',
      );
    else
      ability.effects.forEach((effect, index) => {
        const effectPath = `$.abilities.${id}.effects[${index}]`;
        if (!isRecord(effect)) {
          addError(diagnostics, 'invalid-shape', effectPath, 'Expected an ability effect.');
          return;
        }
        if (effect.op === 'damage' || effect.op === 'heal')
          requireInteger(effect.amount, `${effectPath}.amount`, diagnostics, 1);
        else if (effect.op === 'restore-resource') {
          checkReference(effect.resourceId, resources, `${effectPath}.resourceId`, diagnostics);
          requireInteger(effect.amount, `${effectPath}.amount`, diagnostics, 1);
        } else if (effect.op === 'apply-status')
          checkReference(
            effect.statusEffectId,
            statuses,
            `${effectPath}.statusEffectId`,
            diagnostics,
          );
        else
          addError(
            diagnostics,
            'unknown-effect',
            `${effectPath}.op`,
            `Unknown ability effect operation "${String(effect.op)}".`,
          );
      });
  }

  for (const [id, status] of statuses) {
    requireInteger(
      status.durationTurns,
      `$.statusEffects.${id}.durationTurns`,
      diagnostics,
      1,
      10_000,
    );
    if (status.stackingPolicy !== 'refresh' && status.stackingPolicy !== 'ignore')
      addError(
        diagnostics,
        'invalid-stacking-policy',
        `$.statusEffects.${id}.stackingPolicy`,
        'Stacking policy must be refresh or ignore.',
      );
    validateModifiers(status.modifiers, `$.statusEffects.${id}.modifiers`, attributes, diagnostics);
  }

  const boardCells = new Map<string, ReadonlySet<string>>();
  for (const [id, board] of boards) {
    const widthOk = requireInteger(board.width, `$.boards.${id}.width`, diagnostics, 1, 8);
    const heightOk = requireInteger(board.height, `$.boards.${id}.height`, diagnostics, 1, 8);
    const occupied = new Set<string>();
    if (!Array.isArray(board.blockedCells))
      addError(
        diagnostics,
        'invalid-shape',
        `$.boards.${id}.blockedCells`,
        'Expected an array of blocked cells.',
      );
    else
      board.blockedCells.forEach((cell, index) => {
        const cellPath = `$.boards.${id}.blockedCells[${index}]`;
        const valid = validateCell(
          cell,
          cellPath,
          diagnostics,
          widthOk ? (board.width as number) : undefined,
          heightOk ? (board.height as number) : undefined,
        );
        if (!valid) return;
        const key = cellKey(cell);
        if (occupied.has(key))
          addError(diagnostics, 'duplicate-cell', cellPath, 'Blocked cells must be unique.');
        occupied.add(key);
      });
    boardCells.set(id, occupied);
  }

  for (const [id, encounter] of encounters) {
    const board = typeof encounter.boardId === 'string' ? boards.get(encounter.boardId) : undefined;
    checkReference(encounter.boardId, boards, `$.encounters.${id}.boardId`, diagnostics);
    requireInteger(encounter.maxTurns, `$.encounters.${id}.maxTurns`, diagnostics, 1, 10_000);
    if (typeof encounter.allowWithdrawal !== 'boolean')
      addError(
        diagnostics,
        'invalid-shape',
        `$.encounters.${id}.allowWithdrawal`,
        'Expected a boolean.',
      );
    const participants = encounter.participants;
    const participantIds = new Set<string>();
    const playerCharacterIds = new Set<string>();
    const startCells = new Set<string>();
    if (!Array.isArray(participants) || participants.length < 2 || participants.length > 8)
      addError(
        diagnostics,
        'participant-count',
        `$.encounters.${id}.participants`,
        'An encounter requires two through eight participants.',
      );
    else
      participants.forEach((entry, index) => {
        const participantPath = `$.encounters.${id}.participants[${index}]`;
        if (!isRecord(entry)) {
          addError(
            diagnostics,
            'invalid-shape',
            participantPath,
            'Expected an encounter participant.',
          );
          return;
        }
        if (requireString(entry.id, `${participantPath}.id`, diagnostics)) {
          if (participantIds.has(entry.id))
            addError(
              diagnostics,
              'duplicate-id',
              `${participantPath}.id`,
              'Participant identifiers must be unique within an encounter.',
            );
          participantIds.add(entry.id);
        }
        checkReference(
          entry.characterId,
          characters,
          `${participantPath}.characterId`,
          diagnostics,
        );
        if (entry.team !== 'player' && entry.team !== 'enemy')
          addError(
            diagnostics,
            'invalid-team',
            `${participantPath}.team`,
            'Team must be player or enemy.',
          );
        if (entry.team === 'player' && typeof entry.characterId === 'string')
          playerCharacterIds.add(entry.characterId);
        requireInteger(entry.initiative, `${participantPath}.initiative`, diagnostics, 0);
        const position = entry.position;
        const validCell = validateCell(
          position,
          `${participantPath}.position`,
          diagnostics,
          board && Number.isSafeInteger(board.width) ? (board.width as number) : undefined,
          board && Number.isSafeInteger(board.height) ? (board.height as number) : undefined,
        );
        if (validCell) {
          const key = cellKey(position as UnknownRecord);
          if (startCells.has(key))
            addError(
              diagnostics,
              'occupied-start-cell',
              `${participantPath}.position`,
              'Encounter participants cannot share a starting cell.',
            );
          if (boardCells.get(String(encounter.boardId))?.has(key))
            addError(
              diagnostics,
              'blocked-start-cell',
              `${participantPath}.position`,
              'A participant cannot start on a blocked cell.',
            );
          startCells.add(key);
        }
      });
    if (Array.isArray(participants)) {
      if (!participants.some((entry) => isRecord(entry) && entry.team === 'player'))
        addError(
          diagnostics,
          'missing-team',
          `$.encounters.${id}.participants`,
          'An encounter requires a player participant.',
        );
      if (!participants.some((entry) => isRecord(entry) && entry.team === 'enemy'))
        addError(
          diagnostics,
          'missing-team',
          `$.encounters.${id}.participants`,
          'An encounter requires an enemy participant.',
        );
    }
    validateRewardBundle(
      encounter.victoryRewards,
      `$.encounters.${id}.victoryRewards`,
      characters,
      playerCharacterIds,
      items,
      slots,
      diagnostics,
    );
    const mappings = encounter.outcomeMappings;
    const mapped = new Set<string>();
    if (!Array.isArray(mappings))
      addError(
        diagnostics,
        'invalid-shape',
        `$.encounters.${id}.outcomeMappings`,
        'Expected an array of unguarded outcome mappings.',
      );
    else
      mappings.forEach((mapping, index) => {
        const mappingPath = `$.encounters.${id}.outcomeMappings[${index}]`;
        if (!isRecord(mapping)) {
          addError(diagnostics, 'invalid-shape', mappingPath, 'Expected an outcome mapping.');
          return;
        }
        if (!['victory', 'defeat', 'turn-limit', 'withdrawn'].includes(String(mapping.outcome)))
          addError(
            diagnostics,
            'invalid-outcome',
            `${mappingPath}.outcome`,
            'Unknown terminal encounter outcome.',
          );
        if (typeof mapping.outcome === 'string') {
          if (mapped.has(mapping.outcome))
            addError(
              diagnostics,
              'duplicate-outcome-mapping',
              `${mappingPath}.outcome`,
              'Each terminal outcome may have one required mapping.',
            );
          mapped.add(mapping.outcome);
        }
        requireString(mapping.consequenceId, `${mappingPath}.consequenceId`, diagnostics);
      });
    for (const outcome of ['victory', 'defeat', 'turn-limit'])
      if (!mapped.has(outcome))
        addError(
          diagnostics,
          'missing-outcome-mapping',
          `$.encounters.${id}.outcomeMappings`,
          `A required ${outcome} mapping is missing.`,
        );
    if (encounter.allowWithdrawal === true && !mapped.has('withdrawn'))
      addError(
        diagnostics,
        'missing-outcome-mapping',
        `$.encounters.${id}.outcomeMappings`,
        'A required withdrawn mapping is missing when withdrawal is enabled.',
      );
    if (encounter.allowWithdrawal === false && mapped.has('withdrawn'))
      addError(
        diagnostics,
        'unreachable-outcome-mapping',
        `$.encounters.${id}.outcomeMappings`,
        'Withdrawal mapping is unreachable when withdrawal is disabled.',
      );
  }

  return report(diagnostics);
}
