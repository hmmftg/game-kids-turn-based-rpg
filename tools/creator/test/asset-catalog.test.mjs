import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  addAssetConsumer,
  addSpecifiedAsset,
  approveAssetForGame,
  createAssetCatalog,
  getAssetReadiness,
  markAssetReleaseReady,
  markAssetSourced,
  markAssetValidated,
  parseAssetCatalog,
  recordAssetImport,
  serializeAssetCatalog,
  validateAssetCatalog,
  verifyAssetFiles,
} from '../src/asset-catalog.mjs';

const bytes = Buffer.from('rigged model fixture');
const hash = createHash('sha256').update(bytes).digest('hex');

function makeValidatedCatalog() {
  let catalog = createAssetCatalog();
  catalog = addSpecifiedAsset(catalog, {
    id: 'guardian-rig',
    category: 'animated-model',
    description: 'Guardian character rig used by two sample games.',
    consumerGameIds: ['garden-adventure'],
  });
  catalog = addAssetConsumer(catalog, 'guardian-rig', 'blood-leaf');
  catalog = markAssetSourced(catalog, 'guardian-rig', {
    provider: 'local-generated',
    reference: 'generation-record/guardian-rig.json',
    originalPath: 'sources/guardian.glb',
    originalSha256: hash,
  });
  catalog = recordAssetImport(catalog, 'guardian-rig', {
    runtimePath: 'runtime/guardian-rig.glb',
    runtimeSha256: hash,
    rights: {
      licenseId: 'owned-generated',
      attribution: 'Created for the sample.',
      commercialUse: true,
      redistribution: true,
      evidencePath: 'rights/guardian-rig.md',
    },
    conversion: { tool: 'waypoint-rpg-local-model-import', version: '1.0.0', options: {} },
    inspection: {
      geometry: { triangles: 1200, primitives: 1 },
      materials: ['cloth'],
      textures: [{ width: 512, height: 512, format: 'image/png' }],
      bones: 12,
      morphTargets: [],
      animations: [{ name: 'mixamo idle', durationSeconds: 1 }],
      normalization: { metersPerUnit: 1, upAxis: 'Y', forwardAxis: '-Z' },
      warnings: [],
      compatibilityNotes: [],
    },
    budgets: { maxTriangles: 60000, maxTextureDimension: 2048, maxFileBytes: 12000000 },
  });
  catalog = markAssetValidated(catalog, 'guardian-rig', {
    checks: [
      { id: 'container', passed: true, evidence: 'inspected GLB 2.0' },
      { id: 'budget', passed: true, evidence: 'all configured budgets passed' },
    ],
    validatedBy: 'creator-importer/1.0.0',
  });
  return catalog;
}

test('catalog serialization is canonical, versioned, and detached from authoring objects', () => {
  const input = { options: { z: true, a: 'stable' } };
  let catalog = createAssetCatalog();
  catalog = addSpecifiedAsset(catalog, {
    id: 'test-model',
    category: 'static-model',
    description: 'Simple test model.',
    consumerGameIds: ['z-game', 'a-game'],
  });
  input.options.a = 'mutated after call';
  assert.equal(catalog.assets[0].description, 'Simple test model.');
  const encoded = serializeAssetCatalog(catalog);
  assert.equal(serializeAssetCatalog(parseAssetCatalog(encoded)), encoded);
  assert.deepEqual(catalog.assets[0].consumerGameIds, ['a-game', 'z-game']);
});

test('catalog validation rejects unsupported versions, unsafe keys, and duplicate IDs', () => {
  assert.throws(
    () => parseAssetCatalog('{"schemaVersion":9,"assets":[],"approvals":[]}'),
    /schemaVersion/,
  );
  const catalog = makeValidatedCatalog();
  const duplicate = { ...catalog, assets: [...catalog.assets, catalog.assets[0]] };
  assert.match(
    validateAssetCatalog(duplicate)
      .map((issue) => issue.code)
      .join(','),
    /duplicate-asset-id/,
  );
  const unsafe = { ...catalog, extension: JSON.parse('{"__proto__":{"polluted":true}}') };
  assert.match(
    validateAssetCatalog(unsafe)
      .map((issue) => issue.code)
      .join(','),
    /unsafe-key/,
  );
  const cyclic = { schemaVersion: 1, assets: [], approvals: [] };
  cyclic.extra = cyclic;
  assert.match(
    validateAssetCatalog(cyclic)
      .map((issue) => issue.code)
      .join(','),
    /cyclic-value/,
  );
});

test('readiness transitions require sourcing, import, and passing technical validation', () => {
  let catalog = createAssetCatalog();
  catalog = addSpecifiedAsset(catalog, {
    id: 'lamp',
    category: 'prop-model',
    description: 'Workshop lamp.',
    consumerGameIds: ['blood-leaf'],
  });
  assert.throws(() => markAssetValidated(catalog, 'lamp', { checks: [] }), /imported/);
  catalog = markAssetSourced(catalog, 'lamp', {
    provider: 'kenney',
    reference: 'https://example.test/lamp',
    originalPath: 'sources/lamp.glb',
    originalSha256: hash,
  });
  assert.throws(
    () => recordAssetImport(catalog, 'lamp', { runtimePath: '../escape.glb' }),
    /relative/,
  );
  assert.equal(
    catalog.assets[0].stage,
    'sourced/generated',
    'failed transitions leave the input value unchanged',
  );
});

test('technical validation and release approval are separate, scoped by game', () => {
  let catalog = makeValidatedCatalog();
  assert.throws(
    () => approveAssetForGame(catalog, 'guardian-rig', 'garden-adventure', {}),
    /evidence|reviewer|policy/i,
  );
  catalog = approveAssetForGame(catalog, 'guardian-rig', 'garden-adventure', {
    reviewer: 'asset-reviewer',
    evidencePath: 'reviews/garden-guardian.md',
    licensePolicyId: 'garden-commercial-assets-v1',
    rightsReviewed: true,
    redistributionAllowed: true,
  });
  assert.equal(getAssetReadiness(catalog, 'guardian-rig', 'garden-adventure'), 'approved');
  assert.equal(getAssetReadiness(catalog, 'guardian-rig', 'blood-leaf'), 'validated');
  catalog = markAssetReleaseReady(catalog, 'guardian-rig', 'garden-adventure', {
    reviewer: 'release-reviewer',
    evidencePath: 'reviews/garden-release-smoke.md',
    assetSha256: hash,
    budgetCheck: 'passed',
  });
  assert.equal(getAssetReadiness(catalog, 'guardian-rig', 'garden-adventure'), 'release-ready');
  assert.equal(getAssetReadiness(catalog, 'guardian-rig', 'blood-leaf'), 'validated');
});

test('an approval cannot be reused after the inspected runtime hash changes', () => {
  const catalog = makeValidatedCatalog();
  const approved = approveAssetForGame(catalog, 'guardian-rig', 'garden-adventure', {
    reviewer: 'asset-reviewer',
    evidencePath: 'reviews/garden-guardian.md',
    licensePolicyId: 'garden-commercial-assets-v1',
    rightsReviewed: true,
    redistributionAllowed: true,
  });
  const changed = {
    ...approved,
    assets: approved.assets.map((asset) =>
      asset.id === 'guardian-rig'
        ? { ...asset, runtime: { ...asset.runtime, sha256: '0'.repeat(64) } }
        : asset,
    ),
  };
  assert.ok(validateAssetCatalog(changed).some((issue) => issue.code === 'stale-approval'));
});

test('file verification checks hashes and rejects paths escaping the catalog root', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'creator-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'sources'));
  await mkdir(join(root, 'runtime'));
  await mkdir(join(root, 'rights'));
  await writeFile(join(root, 'sources/guardian.glb'), bytes);
  await writeFile(join(root, 'runtime/guardian-rig.glb'), bytes);
  await writeFile(join(root, 'rights/guardian-rig.md'), 'ownership evidence');
  const catalog = makeValidatedCatalog();
  assert.deepEqual(await verifyAssetFiles(catalog, root), []);
  await writeFile(join(root, 'runtime/guardian-rig.glb'), 'changed');
  const issues = await verifyAssetFiles(catalog, root);
  assert.ok(
    issues.some((issue) => issue.code === 'hash-mismatch' && issue.path.includes('runtime')),
  );
  assert.equal((await readFile(join(root, 'sources/guardian.glb'))).byteLength, bytes.byteLength);
  const unsafe = {
    ...catalog,
    assets: catalog.assets.map((asset) => ({
      ...asset,
      runtime: { ...asset.runtime, path: '../outside.glb' },
    })),
  };
  assert.ok((await verifyAssetFiles(unsafe, root)).some((issue) => issue.code === 'unsafe-path'));
});
