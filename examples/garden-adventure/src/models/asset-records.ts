import records from '../../assets/asset-records.json';
import gardenPolicy from '../../assets/model-budget-policy.json';
import { resolveModelRuntimePolicy, type ModelAssetRecord } from 'waypoint-rpg-three';
import { gardenMaps, gardenTargets } from '../world/world.js';
import { validateGardenModelBindings } from './model-binding-validation.js';

/** Game-owned, integrity-pinned models. Missing or rejected files use the scene geometry. */
export const gardenModelRecords = records as unknown as readonly ModelAssetRecord[];

/** Shared runtime/release policy; the asset checker validates this same JSON document. */
export const gardenModelBudgetPolicy = gardenPolicy;
export const GARDEN_MODEL_RUNTIME_POLICY = resolveModelRuntimePolicy(gardenPolicy.runtimePolicy, {
  mode: 'production',
});

/** Runtime instance bindings and map ownership come from the validated release policy. */
export const GARDEN_MODEL_BINDINGS = gardenPolicy.bindings;
export type GardenModelInstanceId = keyof typeof GARDEN_MODEL_BINDINGS;
export const GARDEN_MODEL_BINDING_VALIDATION = validateGardenModelBindings(GARDEN_MODEL_BINDINGS, {
  assetIds: gardenModelRecords.map((record) => record.id),
  mapIds: Object.keys(gardenMaps),
  targets: gardenTargets,
});
if (GARDEN_MODEL_BINDING_VALIDATION.errors.length > 0)
  throw new Error(
    `Garden model bindings are invalid:\n${GARDEN_MODEL_BINDING_VALIDATION.errors.join('\n')}`,
  );

export function gardenPlayerModelInstanceId(): GardenModelInstanceId {
  const bindingId = GARDEN_MODEL_BINDING_VALIDATION.playerBindingId;
  if (!bindingId) throw new Error('Garden model policy has no player model binding.');
  return bindingId as GardenModelInstanceId;
}

export function gardenModelInstanceIdForTarget(targetKind: string): GardenModelInstanceId {
  const bindingId = GARDEN_MODEL_BINDING_VALIDATION.targetBindingIds[targetKind];
  if (!bindingId)
    throw new Error(`Garden model policy has no binding for target kind ${targetKind}.`);
  return bindingId as GardenModelInstanceId;
}

export const GARDEN_MODEL_IDS = Object.freeze({
  animatedCharacter: GARDEN_MODEL_BINDINGS['garden-hero'].assetId,
  lanternBase: GARDEN_MODEL_BINDINGS['garden-lantern-base'].assetId,
});
