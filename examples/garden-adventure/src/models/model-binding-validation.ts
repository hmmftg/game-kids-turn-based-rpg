export const GARDEN_MODEL_TARGET_KIND = Object.freeze({
  guardian: 'guardian',
  lantern: 'lantern',
} as const);

export interface GardenModelBindingTarget {
  readonly id: string;
  readonly kind: string;
  readonly mapId: string;
}

export interface GardenModelBindingContext {
  readonly assetIds: readonly string[];
  readonly mapIds: readonly string[];
  readonly targets: readonly GardenModelBindingTarget[];
}

export interface GardenModelBindingValidation {
  readonly errors: readonly string[];
  readonly playerBindingId: string | null;
  readonly targetBindingIds: Readonly<Record<string, string>>;
  readonly modelInstancesByMap: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODEL_TARGET_KINDS: readonly string[] = Object.values(GARDEN_MODEL_TARGET_KIND);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Validates game-owned bindings and derives map counts from actual Garden placements. */
export function validateGardenModelBindings(
  value: unknown,
  context: GardenModelBindingContext,
): GardenModelBindingValidation {
  const errors: string[] = [];
  const knownAssets = new Set(context.assetIds);
  const knownMaps = new Set(context.mapIds);
  const knownTargetKinds = new Set(context.targets.map((target) => target.kind));
  const targetInstances = new Map<string, GardenModelBindingTarget[]>();
  for (const target of context.targets) {
    const instances = targetInstances.get(target.kind) ?? [];
    instances.push(target);
    targetInstances.set(target.kind, instances);
    if (!knownMaps.has(target.mapId))
      errors.push(`Garden target ${target.id} references unknown map ${target.mapId}.`);
  }

  const instancesByMap = new Map<string, Record<string, number>>(
    context.mapIds.map((mapId) => [mapId, {}]),
  );
  const targetBindingIds: Record<string, string> = Object.create(null) as Record<string, string>;
  let playerBindingId: string | null = null;
  let playerBindingCount = 0;

  if (!isRecord(value)) {
    errors.push('Garden model policy bindings must be a plain object.');
    return {
      errors,
      playerBindingId,
      targetBindingIds,
      modelInstancesByMap: Object.fromEntries(instancesByMap),
    };
  }

  for (const [instanceId, candidate] of Object.entries(value)) {
    if (!SAFE_ID.test(instanceId))
      errors.push(`Model binding ${instanceId}: instance ID must be stable.`);
    if (!isRecord(candidate)) {
      errors.push(`Model binding ${instanceId} must be an object.`);
      continue;
    }
    for (const key of Object.keys(candidate))
      if (!['assetId', 'mapIds', 'placement'].includes(key))
        errors.push(`Model binding ${instanceId} has unknown field ${key}.`);

    const assetId = candidate.assetId;
    if (typeof assetId !== 'string' || !knownAssets.has(assetId))
      errors.push(`Model binding ${instanceId} references unknown asset ${String(assetId)}.`);

    const declaredMapIds = candidate.mapIds;
    let validDeclaredMapIds: string[] = [];
    if (!Array.isArray(declaredMapIds) || declaredMapIds.length === 0) {
      errors.push(`Model binding ${instanceId} must name at least one map.`);
    } else {
      validDeclaredMapIds = declaredMapIds.filter((mapId): mapId is string => {
        if (typeof mapId !== 'string') {
          errors.push(`Model binding ${instanceId} has a non-string map ID.`);
          return false;
        }
        if (!knownMaps.has(mapId)) {
          errors.push(`Model binding ${instanceId} references unknown map ${mapId}.`);
          return false;
        }
        return true;
      });
      if (new Set(declaredMapIds).size !== declaredMapIds.length)
        errors.push(`Model binding ${instanceId} repeats a map ID.`);
    }

    const placement = candidate.placement;
    if (!isRecord(placement)) {
      errors.push(`Model binding ${instanceId} must declare a player or target placement.`);
      continue;
    }
    for (const key of Object.keys(placement))
      if (!['kind', 'targetKind'].includes(key))
        errors.push(`Model binding ${instanceId} placement has unknown field ${key}.`);

    let actualMapIds: string[] = [];
    if (placement.kind === 'player') {
      playerBindingCount += 1;
      playerBindingId ??= instanceId;
      if (Object.hasOwn(placement, 'targetKind'))
        errors.push(`Player model binding ${instanceId} cannot declare a target kind.`);
      actualMapIds = [...context.mapIds];
    } else if (placement.kind === 'target' && typeof placement.targetKind === 'string') {
      const targetKind = placement.targetKind;
      if (!knownTargetKinds.has(targetKind)) {
        errors.push(`Model binding ${instanceId} references unknown target kind ${targetKind}.`);
      } else if (!MODEL_TARGET_KINDS.includes(targetKind)) {
        errors.push(`Target kind ${targetKind} has no Garden model placement.`);
      } else {
        if (targetBindingIds[targetKind])
          errors.push(`Garden model policy has multiple bindings for target kind ${targetKind}.`);
        else targetBindingIds[targetKind] = instanceId;
        actualMapIds = (targetInstances.get(targetKind) ?? []).map((target) => target.mapId);
        if (actualMapIds.length === 0)
          errors.push(`Garden model target kind ${targetKind} has no actual scene placement.`);
      }
    } else {
      errors.push(`Model binding ${instanceId} must declare a player or target placement.`);
    }

    const uniqueActualMapIds = [...new Set(actualMapIds)];
    if (stableJson(sorted(validDeclaredMapIds)) !== stableJson(sorted(uniqueActualMapIds)))
      errors.push(
        `Model binding ${instanceId} map ownership does not match its actual scene placement.`,
      );

    if (typeof assetId === 'string')
      for (const mapId of actualMapIds) {
        const counts = instancesByMap.get(mapId);
        if (!counts) continue;
        counts[assetId] = (counts[assetId] ?? 0) + 1;
      }
  }

  if (playerBindingCount !== 1)
    errors.push('Garden model policy must declare exactly one player binding.');
  for (const targetKind of MODEL_TARGET_KINDS)
    if (!targetBindingIds[targetKind])
      errors.push(`Garden model policy is missing a binding for target kind ${targetKind}.`);

  return {
    errors,
    playerBindingId,
    targetBindingIds,
    modelInstancesByMap: Object.fromEntries(instancesByMap),
  };
}
