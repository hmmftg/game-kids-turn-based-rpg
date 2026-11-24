import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const ASSET_CATALOG_SCHEMA_VERSION = 1;
export const ASSET_STAGES = Object.freeze([
  'specified',
  'sourced/generated',
  'imported',
  'validated',
]);

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function issue(path, code, message) {
  return { path, code, message };
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspectJsonValue(value, path, issues, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      issues.push(issue(path, 'invalid-number', 'JSON numbers must be finite.'));
    return;
  }
  if (ancestors.has(value)) {
    issues.push(issue(path, 'cyclic-value', 'Catalog data must be acyclic JSON.'));
    return;
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/u.test(key)))
        issues.push(
          issue(path, 'non-json-array-property', 'Arrays may contain only indexed JSON values.'),
        );
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        issues.push(
          issue(`${path}[${index}]`, 'sparse-array', 'Sparse arrays are not valid catalog JSON.'),
        );
        continue;
      }
      inspectJsonValue(value[index], `${path}[${index}]`, issues, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  if (!isPlainObject(value)) {
    issues.push(issue(path, 'non-json-value', 'Catalog data must contain only plain JSON values.'));
    ancestors.delete(value);
    return;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      issues.push(issue(path, 'non-json-key', 'Catalog object keys must be strings.'));
      continue;
    }
    if (UNSAFE_KEYS.has(key))
      issues.push(issue(`${path}.${key}`, 'unsafe-key', 'Unsafe object key.'));
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      issues.push(
        issue(
          `${path}.${key}`,
          'accessor-property',
          'Catalog values cannot contain getters or setters.',
        ),
      );
      continue;
    }
    if (!descriptor.enumerable) {
      issues.push(
        issue(
          `${path}.${key}`,
          'non-json-property',
          'Catalog object properties must be enumerable JSON data.',
        ),
      );
      continue;
    }
    inspectJsonValue(descriptor.value, `${path}.${key}`, issues, ancestors);
  }
  ancestors.delete(value);
}

function clone(value) {
  const issues = [];
  inspectJsonValue(value, '$', issues);
  if (issues.length > 0)
    throw new Error(issues.map(({ path, message }) => `${path}: ${message}`).join('\n'));
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Catalog values must be JSON-serializable.');
  return JSON.parse(serialized);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function immutable(value) {
  return freezeDeep(clone(value));
}

function requireId(value, label) {
  if (typeof value !== 'string' || !ID.test(value))
    throw new Error(`${label} must be stable lowercase kebab-case.`);
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`);
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value))
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
}

function requireRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[a-z]:/i.test(value) ||
    value.split('/').some((part) => part === '..' || part === '.' || part === '')
  ) {
    throw new Error(`${label} must be a normalized relative path using forward slashes.`);
  }
}

function assetIndex(catalog, assetId) {
  const index = catalog.assets.findIndex((asset) => asset.id === assetId);
  if (index < 0) throw new Error(`Unknown asset ID: ${assetId}.`);
  return index;
}

function updateAsset(catalog, assetId, update) {
  assertAssetCatalog(catalog);
  const next = clone(catalog);
  const index = assetIndex(next, assetId);
  next.assets[index] = update(next.assets[index]);
  assertAssetCatalog(next);
  return immutable(next);
}

function normalizeGameIds(gameIds) {
  if (!Array.isArray(gameIds) || gameIds.length === 0)
    throw new Error('At least one consuming game ID is required.');
  for (const gameId of gameIds) requireId(gameId, 'gameId');
  return [...new Set(gameIds)].sort();
}

function assetFor(catalog, assetId) {
  return catalog.assets[assetIndex(catalog, assetId)];
}

function currentApprovalStatus(approval, asset) {
  if (approval.assetSha256 !== asset.runtime.sha256) return null;
  return approval.status;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function createAssetCatalog() {
  return immutable({ schemaVersion: ASSET_CATALOG_SCHEMA_VERSION, assets: [], approvals: [] });
}

export function validateAssetCatalog(catalog) {
  const issues = [];
  inspectJsonValue(catalog, '$', issues);
  if (!isPlainObject(catalog))
    return [...issues, issue('$', 'invalid-root', 'Catalog root must be an object.')];
  if (catalog.schemaVersion !== ASSET_CATALOG_SCHEMA_VERSION)
    issues.push(
      issue(
        '$.schemaVersion',
        'unsupported-schema',
        `Expected schema version ${ASSET_CATALOG_SCHEMA_VERSION}.`,
      ),
    );
  if (!Array.isArray(catalog.assets))
    issues.push(issue('$.assets', 'invalid-assets', 'Assets must be an array.'));
  if (!Array.isArray(catalog.approvals))
    issues.push(issue('$.approvals', 'invalid-approvals', 'Approvals must be an array.'));
  if (!Array.isArray(catalog.assets) || !Array.isArray(catalog.approvals)) return issues;

  const assets = new Map();
  for (const [index, asset] of catalog.assets.entries()) {
    const path = `$.assets[${index}]`;
    if (!isPlainObject(asset)) {
      issues.push(issue(path, 'invalid-asset', 'Asset must be an object.'));
      continue;
    }
    if (typeof asset.id !== 'string' || !ID.test(asset.id))
      issues.push(
        issue(`${path}.id`, 'invalid-asset-id', 'Asset ID must be stable lowercase kebab-case.'),
      );
    else if (assets.has(asset.id))
      issues.push(issue(`${path}.id`, 'duplicate-asset-id', `Duplicate asset ID ${asset.id}.`));
    else assets.set(asset.id, asset);
    if (typeof asset.category !== 'string' || !ID.test(asset.category))
      issues.push(
        issue(
          `${path}.category`,
          'invalid-category',
          'Category must be a lowercase kebab-case identifier.',
        ),
      );
    if (typeof asset.description !== 'string' || asset.description.trim() === '')
      issues.push(
        issue(`${path}.description`, 'missing-description', 'Asset description is required.'),
      );
    if (!ASSET_STAGES.includes(asset.stage))
      issues.push(
        issue(
          `${path}.stage`,
          'invalid-stage',
          `Stage must be one of: ${ASSET_STAGES.join(', ')}.`,
        ),
      );
    if (!Array.isArray(asset.consumerGameIds) || asset.consumerGameIds.length === 0) {
      issues.push(
        issue(
          `${path}.consumerGameIds`,
          'missing-consumers',
          'At least one game consumer is required.',
        ),
      );
    } else {
      const ids = new Set();
      for (const [gameIndex, gameId] of asset.consumerGameIds.entries()) {
        if (typeof gameId !== 'string' || !ID.test(gameId))
          issues.push(
            issue(
              `${path}.consumerGameIds[${gameIndex}]`,
              'invalid-game-id',
              'Game ID must be lowercase kebab-case.',
            ),
          );
        else if (ids.has(gameId))
          issues.push(
            issue(
              `${path}.consumerGameIds[${gameIndex}]`,
              'duplicate-game-id',
              `Duplicate game ID ${gameId}.`,
            ),
          );
        ids.add(gameId);
      }
    }
    if (ASSET_STAGES.indexOf(asset.stage) >= 1)
      validateSource(
        asset.source,
        `${path}.source`,
        ASSET_STAGES.indexOf(asset.stage) >= 2,
        issues,
      );
    if (ASSET_STAGES.indexOf(asset.stage) >= 2) validateImported(asset, path, issues);
    if (asset.stage === 'validated')
      validateValidation(asset.validation, `${path}.validation`, issues);
  }

  const approvalKeys = new Set();
  for (const [index, approval] of catalog.approvals.entries()) {
    const path = `$.approvals[${index}]`;
    if (!isPlainObject(approval)) {
      issues.push(issue(path, 'invalid-approval', 'Approval must be an object.'));
      continue;
    }
    const asset = assets.get(approval.assetId);
    if (!asset) {
      issues.push(
        issue(
          `${path}.assetId`,
          'unknown-asset',
          `Unknown approved asset ${String(approval.assetId)}.`,
        ),
      );
      continue;
    }
    const key = `${approval.assetId}\0${approval.gameId}`;
    if (approvalKeys.has(key))
      issues.push(
        issue(
          path,
          'duplicate-approval',
          'Only one approval record per game and asset is allowed.',
        ),
      );
    approvalKeys.add(key);
    if (typeof approval.gameId !== 'string' || !ID.test(approval.gameId))
      issues.push(
        issue(
          `${path}.gameId`,
          'invalid-game-id',
          'Approval game ID must be lowercase kebab-case.',
        ),
      );
    else if (!asset.consumerGameIds.includes(approval.gameId))
      issues.push(
        issue(
          `${path}.gameId`,
          'unregistered-consumer',
          'Approval game is not registered as an asset consumer.',
        ),
      );
    if (asset.stage !== 'validated')
      issues.push(
        issue(
          path,
          'approval-before-validation',
          'An asset must pass technical validation before release approval.',
        ),
      );
    if (approval.assetSha256 !== asset.runtime?.sha256)
      issues.push(
        issue(
          path,
          'stale-approval',
          'Approval is tied to different runtime bytes and must be reviewed again.',
        ),
      );
    if (approval.commercialUseRequired === true && asset.rights?.commercialUse !== true)
      issues.push(
        issue(
          path,
          'commercial-use-not-allowed',
          'This game requires commercial use but the recorded license forbids it.',
        ),
      );
    if (!['approved', 'release-ready'].includes(approval.status))
      issues.push(
        issue(
          `${path}.status`,
          'invalid-approval-status',
          'Status must be approved or release-ready.',
        ),
      );
    validateApproval(approval, path, issues);
  }
  return issues;
}

function validateSource(source, path, requireFile, issues) {
  if (!isPlainObject(source)) {
    issues.push(issue(path, 'missing-source', 'Source and provenance are required at this stage.'));
    return;
  }
  for (const field of ['provider', 'reference'])
    if (typeof source[field] !== 'string' || source[field].trim() === '')
      issues.push(issue(`${path}.${field}`, 'missing-source-field', `${field} is required.`));
  if (requireFile && !isCatalogPath(source.originalPath))
    issues.push(
      issue(
        `${path}.originalPath`,
        'missing-source-file',
        'Original source path is required after import.',
      ),
    );
  else if (source.originalPath !== undefined && !isCatalogPath(source.originalPath))
    issues.push(
      issue(
        `${path}.originalPath`,
        'unsafe-path',
        'Original path must remain relative to the catalog root.',
      ),
    );
  if (requireFile && !HASH.test(source.originalSha256 ?? ''))
    issues.push(
      issue(
        `${path}.originalSha256`,
        'missing-source-hash',
        'Original source SHA-256 is required after import.',
      ),
    );
  else if (source.originalSha256 !== undefined && !HASH.test(source.originalSha256))
    issues.push(
      issue(`${path}.originalSha256`, 'invalid-hash', 'Original source SHA-256 is invalid.'),
    );
  if (source.generated !== undefined && typeof source.generated !== 'boolean')
    issues.push(
      issue(
        `${path}.generated`,
        'invalid-generated-flag',
        'generated must be boolean when present.',
      ),
    );
}

function isCatalogPath(path) {
  return (
    typeof path === 'string' &&
    path !== '' &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    !path.startsWith('/') &&
    !/^[a-z]:/i.test(path) &&
    !path.split('/').some((part) => part === '..' || part === '.' || part === '')
  );
}

function validateImported(asset, path, issues) {
  if (!isPlainObject(asset.runtime))
    issues.push(issue(`${path}.runtime`, 'missing-runtime', 'Runtime output record is required.'));
  else {
    if (!isCatalogPath(asset.runtime.path))
      issues.push(
        issue(
          `${path}.runtime.path`,
          'unsafe-path',
          'Runtime path must remain relative to the catalog root.',
        ),
      );
    if (!HASH.test(asset.runtime.sha256 ?? ''))
      issues.push(issue(`${path}.runtime.sha256`, 'invalid-hash', 'Runtime SHA-256 is invalid.'));
    if (asset.runtime.format !== 'glb')
      issues.push(
        issue(
          `${path}.runtime.format`,
          'invalid-runtime-format',
          'Runtime asset format must be GLB.',
        ),
      );
  }
  if (!isPlainObject(asset.rights))
    issues.push(
      issue(`${path}.rights`, 'missing-rights', 'License and redistribution facts are required.'),
    );
  else {
    for (const field of ['licenseId', 'attribution', 'evidencePath'])
      if (typeof asset.rights[field] !== 'string' || asset.rights[field].trim() === '')
        issues.push(
          issue(`${path}.rights.${field}`, 'missing-rights-field', `${field} is required.`),
        );
    for (const field of ['commercialUse', 'redistribution'])
      if (typeof asset.rights[field] !== 'boolean')
        issues.push(
          issue(
            `${path}.rights.${field}`,
            'invalid-rights-field',
            `${field} must be explicitly true or false.`,
          ),
        );
    if (asset.rights.evidencePath && !isCatalogPath(asset.rights.evidencePath))
      issues.push(
        issue(
          `${path}.rights.evidencePath`,
          'unsafe-path',
          'Rights evidence must use a relative catalog path.',
        ),
      );
  }
  if (
    !isPlainObject(asset.conversion) ||
    typeof asset.conversion.tool !== 'string' ||
    asset.conversion.tool.trim() === '' ||
    typeof asset.conversion.version !== 'string' ||
    asset.conversion.version.trim() === '' ||
    !isPlainObject(asset.conversion.options)
  )
    issues.push(
      issue(
        `${path}.conversion`,
        'missing-conversion',
        'Conversion tool, version, and options are required.',
      ),
    );
  validateInspection(asset.inspection, `${path}.inspection`, issues);
  if (
    !isPlainObject(asset.budgets) ||
    Object.keys(asset.budgets).length === 0 ||
    Object.values(asset.budgets).some((value) => !Number.isFinite(value) || value <= 0)
  )
    issues.push(
      issue(
        `${path}.budgets`,
        'invalid-budgets',
        'At least one positive numeric budget is required.',
      ),
    );
}

function validateInspection(inspection, path, issues) {
  if (!isPlainObject(inspection)) {
    issues.push(issue(path, 'missing-inspection', 'Technical inspection record is required.'));
    return;
  }
  const geometry = inspection.geometry;
  if (
    !isPlainObject(geometry) ||
    !Number.isSafeInteger(geometry.triangles) ||
    geometry.triangles < 0 ||
    !Number.isSafeInteger(geometry.primitives) ||
    geometry.primitives < 0
  )
    issues.push(
      issue(
        `${path}.geometry`,
        'invalid-geometry',
        'Triangle and primitive counts must be nonnegative safe integers.',
      ),
    );
  if (
    !Array.isArray(inspection.materials) ||
    inspection.materials.some((name) => typeof name !== 'string')
  )
    issues.push(
      issue(
        `${path}.materials`,
        'invalid-materials',
        'Material inventory must be a list of names.',
      ),
    );
  if (
    !Array.isArray(inspection.textures) ||
    inspection.textures.some(
      (texture) =>
        !isPlainObject(texture) ||
        !Number.isSafeInteger(texture.width) ||
        texture.width < 1 ||
        !Number.isSafeInteger(texture.height) ||
        texture.height < 1 ||
        typeof texture.format !== 'string',
    )
  )
    issues.push(
      issue(
        `${path}.textures`,
        'invalid-textures',
        'Texture inventory requires positive dimensions and a format.',
      ),
    );
  if (!Number.isSafeInteger(inspection.bones) || inspection.bones < 0)
    issues.push(
      issue(`${path}.bones`, 'invalid-bones', 'Bone count must be a nonnegative safe integer.'),
    );
  if (
    !Array.isArray(inspection.morphTargets) ||
    inspection.morphTargets.some((name) => typeof name !== 'string')
  )
    issues.push(
      issue(
        `${path}.morphTargets`,
        'invalid-morph-targets',
        'Morph target inventory must be a list of names.',
      ),
    );
  if (
    !Array.isArray(inspection.animations) ||
    inspection.animations.some(
      (animation) =>
        !isPlainObject(animation) ||
        typeof animation.name !== 'string' ||
        !Number.isFinite(animation.durationSeconds) ||
        animation.durationSeconds < 0,
    )
  )
    issues.push(
      issue(
        `${path}.animations`,
        'invalid-animations',
        'Animation inventory entries need a name and nonnegative duration.',
      ),
    );
  if (
    !isPlainObject(inspection.normalization) ||
    !Number.isFinite(inspection.normalization.metersPerUnit) ||
    inspection.normalization.metersPerUnit <= 0 ||
    typeof inspection.normalization.upAxis !== 'string' ||
    typeof inspection.normalization.forwardAxis !== 'string'
  )
    issues.push(
      issue(
        `${path}.normalization`,
        'invalid-normalization',
        'Coordinate conventions and a positive scale are required.',
      ),
    );
  if (
    !Array.isArray(inspection.warnings) ||
    inspection.warnings.some((warning) => typeof warning !== 'string')
  )
    issues.push(
      issue(`${path}.warnings`, 'invalid-warnings', 'Warnings must be a list of strings.'),
    );
  if (
    !Array.isArray(inspection.compatibilityNotes) ||
    inspection.compatibilityNotes.some((note) => typeof note !== 'string')
  )
    issues.push(
      issue(
        `${path}.compatibilityNotes`,
        'invalid-compatibility-notes',
        'Compatibility notes must be a list of strings.',
      ),
    );
}

function validateValidation(validation, path, issues) {
  if (
    !isPlainObject(validation) ||
    typeof validation.validatedBy !== 'string' ||
    validation.validatedBy.trim() === ''
  ) {
    issues.push(
      issue(
        path,
        'missing-validation-evidence',
        'Validated assets require a validator identity and passing checks.',
      ),
    );
    return;
  }
  if (!Array.isArray(validation.checks) || validation.checks.length === 0) {
    issues.push(
      issue(
        `${path}.checks`,
        'missing-validation-checks',
        'At least one technical check is required.',
      ),
    );
    return;
  }
  for (const [index, check] of validation.checks.entries()) {
    if (
      !isPlainObject(check) ||
      !ID.test(check.id ?? '') ||
      check.passed !== true ||
      typeof check.evidence !== 'string' ||
      check.evidence.trim() === ''
    )
      issues.push(
        issue(
          `${path}.checks[${index}]`,
          'failed-validation-check',
          'Every validation check must have an ID, pass, and include evidence.',
        ),
      );
  }
}

function validateApproval(approval, path, issues) {
  for (const field of ['reviewer', 'evidencePath', 'licensePolicyId'])
    if (typeof approval[field] !== 'string' || approval[field].trim() === '')
      issues.push(issue(`${path}.${field}`, 'missing-approval-evidence', `${field} is required.`));
  if (approval.evidencePath && !isCatalogPath(approval.evidencePath))
    issues.push(
      issue(
        `${path}.evidencePath`,
        'unsafe-path',
        'Approval evidence must use a relative catalog path.',
      ),
    );
  if (approval.status === 'approved' || approval.status === 'release-ready') {
    if (approval.rightsReviewed !== true || approval.redistributionAllowed !== true)
      issues.push(
        issue(
          path,
          'rights-not-approved',
          'Release approval requires reviewed rights and redistribution permission.',
        ),
      );
  }
  if (approval.status === 'release-ready') {
    if (!isCatalogPath(approval.releaseEvidencePath))
      issues.push(
        issue(
          `${path}.releaseEvidencePath`,
          'missing-release-evidence',
          'Release evidence is required.',
        ),
      );
    if (approval.budgetCheck !== 'passed')
      issues.push(
        issue(`${path}.budgetCheck`, 'release-budget-not-passed', 'Release budgets must pass.'),
      );
  }
}

export function assertAssetCatalog(catalog) {
  const issues = validateAssetCatalog(catalog);
  if (issues.length > 0)
    throw new Error(issues.map(({ path, message }) => `${path}: ${message}`).join('\n'));
}

export function parseAssetCatalog(text) {
  let catalog;
  try {
    catalog = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Asset catalog contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  assertAssetCatalog(catalog);
  return immutable(catalog);
}

export function serializeAssetCatalog(catalog) {
  assertAssetCatalog(catalog);
  const normalized = clone(catalog);
  normalized.assets.sort((left, right) => left.id.localeCompare(right.id));
  normalized.approvals.sort((left, right) =>
    `${left.assetId}\0${left.gameId}`.localeCompare(`${right.assetId}\0${right.gameId}`),
  );
  return `${JSON.stringify(canonicalize(normalized), null, 2)}\n`;
}

export function addSpecifiedAsset(catalog, { id, category, description, consumerGameIds }) {
  assertAssetCatalog(catalog);
  requireId(id, 'Asset ID');
  requireId(category, 'Asset category');
  requireText(description, 'Asset description');
  const consumers = normalizeGameIds(consumerGameIds);
  if (catalog.assets.some((asset) => asset.id === id))
    throw new Error(`Asset ID ${id} already exists.`);
  return immutable({
    ...clone(catalog),
    assets: [
      ...clone(catalog.assets),
      { id, category, description, stage: 'specified', consumerGameIds: consumers },
    ],
  });
}

export function addAssetConsumer(catalog, assetId, gameId) {
  requireId(gameId, 'gameId');
  return updateAsset(catalog, assetId, (asset) => ({
    ...asset,
    consumerGameIds: [...new Set([...asset.consumerGameIds, gameId])].sort(),
  }));
}

export function markAssetSourced(catalog, assetId, source) {
  requireText(source?.provider, 'Source provider');
  requireText(source?.reference, 'Source reference');
  requireRelativePath(source?.originalPath, 'Source originalPath');
  requireHash(source?.originalSha256, 'Source originalSha256');
  if (source.generated !== undefined && typeof source.generated !== 'boolean')
    throw new Error('Source generated must be boolean when provided.');
  return updateAsset(catalog, assetId, (asset) => {
    if (asset.stage !== 'specified')
      throw new Error(`Asset ${assetId} must be specified before it is sourced.`);
    return { ...asset, stage: 'sourced/generated', source: clone(source) };
  });
}

export function recordAssetImport(catalog, assetId, imported) {
  imported = clone(imported);
  return updateAsset(catalog, assetId, (asset) => {
    if (asset.stage !== 'sourced/generated')
      throw new Error(`Asset ${assetId} must be sourced before import.`);
    requireRelativePath(imported.runtimePath, 'Runtime path');
    requireHash(imported.runtimeSha256, 'Runtime SHA-256');
    const next = {
      ...asset,
      stage: 'imported',
      runtime: { path: imported.runtimePath, format: 'glb', sha256: imported.runtimeSha256 },
      rights: clone(imported.rights),
      conversion: clone(imported.conversion),
      inspection: clone(imported.inspection),
      budgets: clone(imported.budgets),
    };
    const issues = validateAssetCatalog({
      ...catalog,
      assets: catalog.assets.map((entry) => (entry.id === assetId ? next : entry)),
    });
    if (issues.length > 0)
      throw new Error(issues.map(({ path, message }) => `${path}: ${message}`).join('\n'));
    return next;
  });
}

export function markAssetValidated(catalog, assetId, validation) {
  validation = clone(validation);
  return updateAsset(catalog, assetId, (asset) => {
    if (asset.stage !== 'imported')
      throw new Error(`Asset ${assetId} must be imported before technical validation.`);
    const next = { ...asset, stage: 'validated', validation: clone(validation) };
    const issues = validateAssetCatalog({
      ...catalog,
      assets: catalog.assets.map((entry) => (entry.id === assetId ? next : entry)),
    });
    if (issues.length > 0)
      throw new Error(issues.map(({ path, message }) => `${path}: ${message}`).join('\n'));
    return next;
  });
}

export function approveAssetForGame(catalog, assetId, gameId, evidence) {
  assertAssetCatalog(catalog);
  evidence = clone(evidence);
  requireId(gameId, 'gameId');
  const asset = assetFor(catalog, assetId);
  if (asset.stage !== 'validated')
    throw new Error(`Asset ${assetId} must pass technical validation before approval.`);
  if (!asset.consumerGameIds.includes(gameId))
    throw new Error(`Register ${gameId} as an asset consumer before approval.`);
  if (asset.rights.redistribution !== true)
    throw new Error(`Asset ${assetId} rights do not allow redistribution.`);
  requireText(evidence.reviewer, 'Approval reviewer');
  requireRelativePath(evidence.evidencePath, 'Approval evidencePath');
  requireText(evidence.licensePolicyId, 'License policy ID');
  if (evidence.rightsReviewed !== true || evidence.redistributionAllowed !== true)
    throw new Error('Approval requires reviewed rights and explicit redistribution permission.');
  if (evidence.commercialUseRequired === true && asset.rights.commercialUse !== true)
    throw new Error(`Asset ${assetId} rights do not allow commercial use required by ${gameId}.`);
  const approval = {
    assetId,
    gameId,
    status: 'approved',
    assetSha256: asset.runtime.sha256,
    reviewer: evidence.reviewer,
    evidencePath: evidence.evidencePath,
    licensePolicyId: evidence.licensePolicyId,
    rightsReviewed: true,
    redistributionAllowed: true,
    commercialUseRequired: evidence.commercialUseRequired === true,
  };
  const next = clone(catalog);
  next.approvals = next.approvals.filter(
    (entry) => !(entry.assetId === assetId && entry.gameId === gameId),
  );
  next.approvals.push(approval);
  assertAssetCatalog(next);
  return immutable(next);
}

export function markAssetReleaseReady(catalog, assetId, gameId, evidence) {
  assertAssetCatalog(catalog);
  evidence = clone(evidence);
  requireId(gameId, 'gameId');
  const asset = assetFor(catalog, assetId);
  const oldApproval = catalog.approvals.find(
    (entry) => entry.assetId === assetId && entry.gameId === gameId,
  );
  if (oldApproval?.status !== 'approved')
    throw new Error(`Asset ${assetId} must be approved for ${gameId} before release readiness.`);
  requireText(evidence.reviewer, 'Release reviewer');
  requireRelativePath(evidence.evidencePath, 'Release evidencePath');
  if (evidence.assetSha256 !== asset.runtime.sha256)
    throw new Error('Release evidence must match the current runtime asset hash.');
  if (evidence.budgetCheck !== 'passed')
    throw new Error('Release readiness requires passing game performance budgets.');
  const next = clone(catalog);
  const index = next.approvals.findIndex(
    (entry) => entry.assetId === assetId && entry.gameId === gameId,
  );
  next.approvals[index] = {
    ...next.approvals[index],
    status: 'release-ready',
    releaseReviewer: evidence.reviewer,
    releaseEvidencePath: evidence.evidencePath,
    budgetCheck: 'passed',
  };
  assertAssetCatalog(next);
  return immutable(next);
}

export function getAssetReadiness(catalog, assetId, gameId) {
  assertAssetCatalog(catalog);
  const asset = assetFor(catalog, assetId);
  if (!gameId) return asset.stage;
  const approval = catalog.approvals.find(
    (entry) => entry.assetId === assetId && entry.gameId === gameId,
  );
  return approval ? (currentApprovalStatus(approval, asset) ?? asset.stage) : asset.stage;
}

export async function verifyAssetFiles(catalog, catalogDirectory) {
  const issues = validateAssetCatalog(catalog);
  if (issues.length > 0) return issues;
  const root = await realpath(catalogDirectory);
  const entries = catalog.assets.filter((asset) => ASSET_STAGES.indexOf(asset.stage) >= 1);
  for (const asset of entries) {
    const files = [
      { path: asset.source.originalPath, expected: asset.source.originalSha256, label: 'source' },
      ...(asset.runtime
        ? [{ path: asset.runtime.path, expected: asset.runtime.sha256, label: 'runtime' }]
        : []),
      ...(asset.rights
        ? [{ path: asset.rights.evidencePath, expected: null, label: 'rights-evidence' }]
        : []),
      ...catalog.approvals
        .filter((approval) => approval.assetId === asset.id)
        .flatMap((approval) => [
          { path: approval.evidencePath, expected: null, label: `approval-${approval.gameId}` },
          ...(approval.releaseEvidencePath
            ? [
                {
                  path: approval.releaseEvidencePath,
                  expected: null,
                  label: `release-${approval.gameId}`,
                },
              ]
            : []),
        ]),
    ];
    for (const entry of files) {
      const diagnosticPath = `assets.${asset.id}.${entry.label}`;
      if (!isCatalogPath(entry.path)) {
        issues.push(
          issue(
            diagnosticPath,
            'unsafe-path',
            'Asset file path is not confined to the catalog root.',
          ),
        );
        continue;
      }
      const candidate = resolve(root, ...entry.path.split('/'));
      const lexicalRelative = relative(root, candidate);
      if (
        lexicalRelative === '..' ||
        lexicalRelative.startsWith(`..${sep}`) ||
        isAbsolute(lexicalRelative)
      ) {
        issues.push(
          issue(diagnosticPath, 'unsafe-path', 'Asset file path escapes the catalog root.'),
        );
        continue;
      }
      const actualPath = await realpath(candidate).catch(() => null);
      if (!actualPath) {
        issues.push(
          issue(diagnosticPath, 'missing-file', `Catalog file ${entry.path} does not exist.`),
        );
        continue;
      }
      const realRelative = relative(root, actualPath);
      if (
        realRelative === '..' ||
        realRelative.startsWith(`..${sep}`) ||
        isAbsolute(realRelative)
      ) {
        issues.push(
          issue(diagnosticPath, 'unsafe-path', 'Asset file symlink escapes the catalog root.'),
        );
        continue;
      }
      const actualHash = createHash('sha256')
        .update(await readFile(actualPath))
        .digest('hex');
      if (entry.expected && actualHash !== entry.expected)
        issues.push(
          issue(
            diagnosticPath,
            'hash-mismatch',
            `Expected ${entry.expected}; found ${actualHash}.`,
          ),
        );
    }
  }
  return issues;
}
