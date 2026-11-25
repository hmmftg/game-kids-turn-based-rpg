import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectModel } from '../tools/creator/src/model-import.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultGameRoot = resolve(repositoryRoot, 'examples/garden-adventure');
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;

function isContained(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return !(
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  );
}

async function readJson(path, label, errors) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableJson(item)]),
    );
  return value;
}

function validatePolicy(policy, records, errors) {
  if (policy?.schemaVersion !== 1 || policy.gameId !== 'garden-of-stories') {
    errors.push('model-budget-policy.json: expected Garden of Stories policy schema version 1.');
    return null;
  }
  const runtime = policy.runtimePolicy;
  if (
    !runtime ||
    runtime.allowUnapproved !== false ||
    !Number.isSafeInteger(runtime.maxTrianglesPerAsset) ||
    runtime.maxTrianglesPerAsset < 1 ||
    !Number.isSafeInteger(runtime.maxLoadedAssets) ||
    runtime.maxLoadedAssets < 1 ||
    !Number.isSafeInteger(runtime.maxDecodedGeometryBytes) ||
    runtime.maxDecodedGeometryBytes < 1 ||
    !Number.isSafeInteger(runtime.maxSceneTriangles) ||
    runtime.maxSceneTriangles < 1
  ) {
    errors.push('model-budget-policy.json: runtime model limits must be positive integers.');
  }

  const policyAssets = Array.isArray(policy.assets) ? policy.assets : [];
  const positiveAssetLimits = [
    'maxFileBytes',
    'maxTriangles',
    'maxTextureBytes',
    'maxTextureDimension',
    'maxDecodedBytes',
  ];
  const budgets = new Map();
  for (const asset of policyAssets) {
    if (!asset || !SAFE_ID.test(asset.id ?? '') || budgets.has(asset.id)) {
      errors.push('model-budget-policy.json: assets must have unique stable IDs.');
      continue;
    }
    budgets.set(asset.id, asset);
    for (const field of positiveAssetLimits)
      if (!Number.isSafeInteger(asset[field]) || asset[field] < 1)
        errors.push(`${asset.id}: ${field} must be a positive integer.`);
    for (const field of ['maxJoints', 'maxClips'])
      if (!Number.isSafeInteger(asset[field]) || asset[field] < 0)
        errors.push(`${asset.id}: ${field} must be a non-negative integer.`);
  }
  const recordIds = new Set(records.map((record) => record?.id));
  for (const id of recordIds)
    if (!budgets.has(id)) errors.push(`No Garden model budget is set for ${id}.`);
  for (const id of budgets.keys())
    if (!recordIds.has(id)) errors.push(`Budget entry ${id} has no model record.`);

  const mapBudgets =
    policy.maps && typeof policy.maps === 'object' && !Array.isArray(policy.maps)
      ? policy.maps
      : {};
  if (mapBudgets !== policy.maps)
    errors.push('model-budget-policy.json: maps must be an object of map budgets.');
  const declaredInstances = new Map(Object.keys(mapBudgets).map((mapId) => [mapId, {}]));
  const bindings = policy.bindings;
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) {
    errors.push('model-budget-policy.json: bindings must declare runtime model instances.');
  } else {
    for (const [instanceId, binding] of Object.entries(bindings)) {
      if (!SAFE_ID.test(instanceId))
        errors.push(`Model binding ${instanceId}: instance ID must be stable.`);
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
        errors.push(`Model binding ${instanceId} must be an object.`);
        continue;
      }
      if (!recordIds.has(binding.assetId))
        errors.push(`Model binding ${instanceId} references unknown asset ${binding.assetId}.`);
      if (!Array.isArray(binding.mapIds) || binding.mapIds.length === 0) {
        errors.push(`Model binding ${instanceId} must name at least one map.`);
        continue;
      }
      if (new Set(binding.mapIds).size !== binding.mapIds.length)
        errors.push(`Model binding ${instanceId} repeats a map ID.`);
      for (const mapId of binding.mapIds) {
        const counts = declaredInstances.get(mapId);
        if (!counts) {
          errors.push(`Model binding ${instanceId} references unknown map ${mapId}.`);
          continue;
        }
        counts[binding.assetId] = (counts[binding.assetId] ?? 0) + 1;
      }
      const placement = binding.placement;
      if (
        !placement ||
        !(
          placement.kind === 'player' ||
          (placement.kind === 'target' && SAFE_ID.test(placement.targetKind ?? ''))
        )
      )
        errors.push(`Model binding ${instanceId} must declare a player or target placement.`);
    }
  }

  for (const [mapId, expected] of declaredInstances) {
    const actual = mapBudgets[mapId]?.modelInstances;
    if (JSON.stringify(stableJson(actual ?? {})) !== JSON.stringify(stableJson(expected)))
      errors.push(`Map ${mapId}: modelInstances do not match the declared model bindings.`);
  }

  const positiveMapLimits = [
    'maxUniqueAssets',
    'maxAssetInstances',
    'maxTriangles',
    'maxEncodedModelBytes',
    'maxDecodedGeometryBytes',
  ];
  for (const [mapId, map] of Object.entries(mapBudgets)) {
    if (!SAFE_ID.test(mapId)) errors.push(`Map ${mapId}: map ID must be stable.`);
    for (const field of positiveMapLimits)
      if (!Number.isSafeInteger(map?.[field]) || map[field] < 1)
        errors.push(`Map ${mapId}: ${field} must be a positive integer.`);
    const instances = map?.modelInstances;
    if (!instances || typeof instances !== 'object' || Array.isArray(instances)) {
      errors.push(`Map ${mapId}: modelInstances must be an object of asset counts.`);
      continue;
    }
    let totalTriangles = 0;
    let totalInstances = 0;
    let encodedBytes = 0;
    let decodedBytes = 0;
    const uniqueIds = Object.keys(instances);
    for (const [id, count] of Object.entries(instances)) {
      const record = records.find((entry) => entry?.id === id);
      if (!record) {
        errors.push(`Map ${mapId}: ${id} has no model record.`);
        continue;
      }
      if (!Number.isSafeInteger(count) || count < 1) {
        errors.push(`Map ${mapId}: ${id} instance count must be a positive integer.`);
        continue;
      }
      totalTriangles += record.metrics.triangles * count;
      totalInstances += count;
      encodedBytes += record.metrics.outputBytes;
      decodedBytes += record.metrics.estimatedDecodedBytes;
    }
    if (uniqueIds.length > map.maxUniqueAssets)
      errors.push(`Map ${mapId}: unique-asset budget exceeded.`);
    if (totalInstances > map.maxAssetInstances)
      errors.push(`Map ${mapId}: instance budget exceeded.`);
    if (totalTriangles > map.maxTriangles) errors.push(`Map ${mapId}: triangle budget exceeded.`);
    if (encodedBytes > map.maxEncodedModelBytes)
      errors.push(`Map ${mapId}: encoded-byte budget exceeded.`);
    if (decodedBytes > map.maxDecodedGeometryBytes)
      errors.push(`Map ${mapId}: decoded-geometry budget exceeded.`);
    if (decodedBytes > (runtime?.maxDecodedGeometryBytes ?? 0))
      errors.push(`Map ${mapId}: runtime decoded-geometry limit exceeded.`);
    if (uniqueIds.length > (runtime?.maxLoadedAssets ?? 0))
      errors.push(`Map ${mapId}: runtime loaded-asset limit exceeded.`);
    if (totalTriangles > runtime.maxSceneTriangles)
      errors.push(`Map ${mapId}: runtime scene triangle limit exceeded.`);
  }

  return budgets;
}

function validateApproval(receipt, record, budget, errors) {
  if (!receipt || typeof receipt !== 'object') {
    errors.push(`Independent release approval is missing for ${record.id}.`);
    return;
  }
  if (receipt.assetId !== record.id || receipt.reviewedSha256 !== record.outputSha256)
    errors.push(`Release approval for ${record.id} must bind the exact current GLB hash.`);
  if (typeof receipt.approver !== 'string' || receipt.approver.trim().length < 3)
    errors.push(`Release approval for ${record.id} must name an independent approver.`);
  else if (receipt.approver.trim().toLowerCase() === budget.preparedBy.trim().toLowerCase())
    errors.push(
      `Release approval for ${record.id} must come from someone other than its preparer.`,
    );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.approvedAt ?? ''))
    errors.push(`Release approval for ${record.id} must include its approval date.`);
  if (typeof receipt.evidenceRef !== 'string' || receipt.evidenceRef.trim().length < 3)
    errors.push(`Release approval for ${record.id} must link to review evidence.`);
}

export async function validateGardenAssets({
  gameRoot = defaultGameRoot,
  release = false,
  inspect = inspectModel,
} = {}) {
  const errors = [];
  const root = await realpath(gameRoot).catch(() => null);
  if (!root) return [`Garden sample directory is missing: ${gameRoot}`];

  const [manifest, policy, approvalFile] = await Promise.all([
    readJson(resolve(root, 'assets/asset-records.json'), 'asset-records.json', errors),
    readJson(resolve(root, 'assets/model-budget-policy.json'), 'model-budget-policy.json', errors),
    readJson(resolve(root, 'assets/release-approvals.json'), 'release-approvals.json', errors),
  ]);
  if (!Array.isArray(manifest)) {
    errors.push('asset-records.json: expected a list of bundled Garden model records.');
    return errors;
  }
  if (!manifest.length) errors.push('asset-records.json: at least one model record is required.');
  const recordsById = new Map();
  for (const record of manifest) {
    if (!record || !SAFE_ID.test(record.id ?? '') || recordsById.has(record.id)) {
      errors.push('asset-records.json: model IDs must be unique stable identifiers.');
      continue;
    }
    recordsById.set(record.id, record);
    if (record.runtimePath !== `models/${record.id}.glb` || !SHA256.test(record.outputSha256 ?? ''))
      errors.push(`${record.id}: runtime path or recorded GLB hash is invalid.`);
  }
  const records = [...recordsById.values()];
  const budgets = validatePolicy(policy, records, errors);
  const modelPublicRoot = resolve(root, 'public');
  const realPublicRoot = await realpath(modelPublicRoot).catch(() => null);
  const actualModelPaths = new Set();

  for (const record of records) {
    const budget = budgets?.get(record.id);
    if (!budget) continue;
    const modelRelative = `public/${record.runtimePath}`;
    const modelPath = resolve(root, modelRelative);
    const realModelPath = await realpath(modelPath).catch(() => null);
    if (!realPublicRoot || !realModelPath || !isContained(realPublicRoot, realModelPath)) {
      errors.push(
        `${record.id}: runtime GLB must be a regular file confined under Garden public/.`,
      );
      continue;
    }
    const fileInfo = await stat(realModelPath).catch(() => null);
    if (!fileInfo?.isFile()) {
      errors.push(`${record.id}: runtime GLB is not a regular file.`);
      continue;
    }
    actualModelPaths.add(resolve(realModelPath));

    try {
      const metadataPath = resolve(root, `assets/model-metadata/${record.id}.asset.json`);
      const sourcePath = resolve(root, `assets/model-sources/${record.id}.source.glb`);
      const [sourceRecord, actual] = await Promise.all([
        inspect({
          sourcePath,
          metadataPath,
          preserveGlbBytes: true,
        }),
        inspect({
          sourcePath: realModelPath,
          metadataPath,
          preserveGlbBytes: true,
        }),
      ]);
      if (
        sourceRecord.sourceSha256 !== record.sourceSha256 ||
        sourceRecord.metrics.sourceBytes !== record.metrics.sourceBytes
      )
        errors.push(`${record.id}: source fixture hash or byte count differs from its provenance.`);
      const normalizedActual = {
        ...actual,
        sourceSha256: record.sourceSha256,
        clipInventory: actual.clipInventory.map(({ name, durationSeconds }) => ({
          name,
          durationSeconds,
        })),
        metrics: { ...actual.metrics, sourceBytes: record.metrics.sourceBytes },
      };
      const mismatchedFields = Object.keys(record).filter(
        (field) =>
          JSON.stringify(stableJson(normalizedActual[field])) !==
          JSON.stringify(stableJson(record[field])),
      );
      if (mismatchedFields.length)
        errors.push(
          `${record.id}: actual GLB or metadata differs in ${mismatchedFields.join(', ')}${
            mismatchedFields.includes('clipInventory')
              ? ` (found ${JSON.stringify(actual.clipInventory)}; expected ${JSON.stringify(record.clipInventory)})`
              : ''
          }.`,
        );

      const metrics = actual.metrics;
      if (metrics.outputBytes > budget.maxFileBytes)
        errors.push(`${record.id}: file-byte budget exceeded.`);
      if (metrics.triangles > budget.maxTriangles)
        errors.push(`${record.id}: triangle budget exceeded.`);
      if (metrics.textureBytes > budget.maxTextureBytes)
        errors.push(`${record.id}: texture-byte budget exceeded.`);
      if (metrics.maxTextureDimension > budget.maxTextureDimension)
        errors.push(`${record.id}: maximum texture dimension exceeded.`);
      if (metrics.estimatedDecodedBytes > budget.maxDecodedBytes)
        errors.push(`${record.id}: decoded-byte budget exceeded.`);
      if (metrics.jointCount > budget.maxJoints)
        errors.push(`${record.id}: joint budget exceeded.`);
      if (actual.clipInventory.length > budget.maxClips)
        errors.push(`${record.id}: clip budget exceeded.`);
      if (metrics.triangles > (policy.runtimePolicy?.maxTrianglesPerAsset ?? 0))
        errors.push(`${record.id}: runtime per-asset triangle limit exceeded.`);
      if (!actual.rights.commercialUse || !actual.rights.redistribution || !actual.rights.approved)
        errors.push(`${record.id}: approved commercial redistribution rights are required.`);
    } catch (error) {
      errors.push(
        `${record.id}: GLB inspection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (realPublicRoot) {
    const scan = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await scan(path);
        else if (/\.gltf?$/i.test(entry.name) || /\.glb$/i.test(entry.name)) {
          const realPath = await realpath(path).catch(() => null);
          if (realPath && !actualModelPaths.has(resolve(realPath)))
            errors.push(
              `Unregistered 3D model is present in Garden public/: ${relative(root, path)}.`,
            );
        }
      }
    };
    await scan(realPublicRoot);
  }

  if (release) {
    if (approvalFile?.schemaVersion !== 1 || approvalFile.gameId !== 'garden-of-stories') {
      errors.push('release-approvals.json: expected Garden of Stories approval schema version 1.');
    } else {
      const approvals = Array.isArray(approvalFile.approvals) ? approvalFile.approvals : [];
      const byId = new Map();
      for (const approval of approvals) {
        if (byId.has(approval?.assetId))
          errors.push(`Duplicate release approval for ${approval?.assetId}.`);
        byId.set(approval?.assetId, approval);
      }
      for (const record of records)
        validateApproval(byId.get(record.id), record, budgets?.get(record.id), errors);
      for (const assetId of byId.keys())
        if (!recordsById.has(assetId))
          errors.push(`Release approval references unknown asset ${assetId}.`);
    }
  }

  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const release = process.argv.slice(2).includes('--release');
  const errors = await validateGardenAssets({ release });
  if (errors.length) {
    for (const error of errors) process.stderr.write(`error [garden-assets] ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Garden asset integrity and game budgets passed${release ? ' with independent release approval' : ''}.\n`,
    );
  }
}
