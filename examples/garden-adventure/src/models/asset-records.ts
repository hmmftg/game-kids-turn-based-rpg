import records from '../../assets/asset-records.json';
import gardenPolicy from '../../assets/model-budget-policy.json';
import type { ModelAssetRecord, ModelRuntimePolicy } from 'waypoint-rpg-three';

/** Game-owned, integrity-pinned models. Missing or rejected files use the scene geometry. */
export const gardenModelRecords = records as unknown as readonly ModelAssetRecord[];

/** Shared runtime/release policy; the asset checker validates this same JSON document. */
export const gardenModelBudgetPolicy = gardenPolicy;
export const GARDEN_MODEL_RUNTIME_POLICY: Readonly<ModelRuntimePolicy> = Object.freeze(
  gardenPolicy.runtimePolicy as ModelRuntimePolicy,
);

/** Runtime instance bindings and map ownership come from the validated release policy. */
export const GARDEN_MODEL_BINDINGS = gardenPolicy.bindings;
export type GardenModelInstanceId = keyof typeof GARDEN_MODEL_BINDINGS;

export function gardenPlayerModelInstanceId(): GardenModelInstanceId {
  const binding = Object.entries(GARDEN_MODEL_BINDINGS).find(
    ([, value]) => value.placement.kind === 'player',
  );
  if (!binding) throw new Error('Garden model policy has no player model binding.');
  return binding[0] as GardenModelInstanceId;
}

export function gardenModelInstanceIdForTarget(targetKind: string): GardenModelInstanceId {
  const binding = Object.entries(GARDEN_MODEL_BINDINGS).find(
    ([, value]) => 'targetKind' in value.placement && value.placement.targetKind === targetKind,
  );
  if (!binding)
    throw new Error(`Garden model policy has no binding for target kind ${targetKind}.`);
  return binding[0] as GardenModelInstanceId;
}

export const GARDEN_MODEL_IDS = Object.freeze({
  animatedCharacter: GARDEN_MODEL_BINDINGS['garden-hero'].assetId,
  lanternBase: GARDEN_MODEL_BINDINGS['garden-lantern-base'].assetId,
});
