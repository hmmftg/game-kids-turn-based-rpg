import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { validateGardenAssets } from './validate-garden-assets.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const gardenRoot = path.join(repositoryRoot, 'examples/garden-adventure');

async function copyGardenAssetInputs() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'garden-asset-check-'));
  const gameRoot = path.join(temporaryRoot, 'garden-adventure');
  await cp(path.join(gardenRoot, 'assets'), path.join(gameRoot, 'assets'), { recursive: true });
  await cp(path.join(gardenRoot, 'public'), path.join(gameRoot, 'public'), { recursive: true });
  return { gameRoot, temporaryRoot };
}

test('Garden bundled models match their measured source/output records and per-map budgets', async () => {
  assert.deepEqual(await validateGardenAssets(), []);
});

test('release approvals bind each model hash and come from an independent reviewer', async () => {
  const { gameRoot, temporaryRoot } = await copyGardenAssetInputs();
  try {
    const unapproved = await validateGardenAssets({ gameRoot, release: true });
    assert.equal(unapproved.filter((message) => message.includes('approval is missing')).length, 2);

    const records = JSON.parse(
      await readFile(path.join(gameRoot, 'assets/asset-records.json'), 'utf8'),
    );
    const approvalPath = path.join(gameRoot, 'assets/release-approvals.json');
    const approvals = {
      schemaVersion: 1,
      gameId: 'garden-of-stories',
      approvals: records.map((record) => ({
        assetId: record.id,
        reviewedSha256: record.outputSha256,
        approver: 'Independent sample reviewer',
        approvedAt: '2026-11-25',
        evidenceRef: `REVIEW-${record.id}`,
      })),
    };
    await writeFile(approvalPath, `${JSON.stringify(approvals, null, 2)}\n`);
    assert.deepEqual(await validateGardenAssets({ gameRoot, release: true }), []);

    approvals.approvals[0].approver = 'synthetic-fixture-author';
    await writeFile(approvalPath, `${JSON.stringify(approvals, null, 2)}\n`);
    assert.ok(
      (await validateGardenAssets({ gameRoot, release: true })).some((message) =>
        message.includes('someone other than its preparer'),
      ),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('asset manifest and map budgets reject altered hashes and over-budget records', async () => {
  const { gameRoot, temporaryRoot } = await copyGardenAssetInputs();
  try {
    const manifestPath = path.join(gameRoot, 'assets/asset-records.json');
    const records = JSON.parse(await readFile(manifestPath, 'utf8'));
    const originalRecords = structuredClone(records);
    records[0].outputSha256 = '0'.repeat(64);
    await writeFile(manifestPath, `${JSON.stringify(records, null, 2)}\n`);
    assert.ok(
      (await validateGardenAssets({ gameRoot })).some((message) => message.includes('differs')),
    );

    await writeFile(manifestPath, `${JSON.stringify(originalRecords, null, 2)}\n`);
    const policyPath = path.join(gameRoot, 'assets/model-budget-policy.json');
    const policy = JSON.parse(await readFile(policyPath, 'utf8'));
    policy.assets.find((asset) => asset.id === originalRecords[0].id).maxTriangles = 1;
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    assert.ok(
      (await validateGardenAssets({ gameRoot })).some((message) =>
        message.includes('triangle budget'),
      ),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('map instance budgets must match the declared runtime model bindings', async () => {
  const { gameRoot, temporaryRoot } = await copyGardenAssetInputs();
  try {
    const policyPath = path.join(gameRoot, 'assets/model-budget-policy.json');
    const policy = JSON.parse(await readFile(policyPath, 'utf8'));
    policy.bindings = {
      'garden-hero': {
        assetId: 'phase5-animated-guardian',
        mapIds: ['village', 'garden'],
      },
      'garden-guardian': {
        assetId: 'phase5-animated-guardian',
        mapIds: ['garden'],
      },
      'garden-lantern-base': {
        assetId: 'phase5-textured-static',
        mapIds: ['garden'],
      },
    };
    policy.maps.village.modelInstances['phase5-animated-guardian'] = 2;
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

    assert.ok(
      (await validateGardenAssets({ gameRoot })).some((message) =>
        message.includes('Map village: modelInstances do not match the declared model bindings.'),
      ),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('runtime asset policy rejects zero limits and bindings to unknown assets or maps', async () => {
  const { gameRoot, temporaryRoot } = await copyGardenAssetInputs();
  try {
    const policyPath = path.join(gameRoot, 'assets/model-budget-policy.json');
    const policy = JSON.parse(await readFile(policyPath, 'utf8'));
    policy.runtimePolicy.maxLoadedAssets = 0;
    policy.assets[0].maxFileBytes = 0;
    policy.maps.village.maxTriangles = 0;
    policy.bindings = {
      'garden-hero': { assetId: 'missing-model', mapIds: ['missing-map'] },
    };
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

    const errors = await validateGardenAssets({ gameRoot });
    assert.ok(errors.some((message) => message.includes('maxLoadedAssets')));
    assert.ok(
      errors.some((message) =>
        message.includes('phase5-animated-guardian: maxFileBytes must be a positive integer.'),
      ),
    );
    assert.ok(
      errors.some((message) =>
        message.includes('Map village: maxTriangles must be a positive integer.'),
      ),
    );
    assert.ok(
      errors.some((message) =>
        message.includes('Model binding garden-hero references unknown asset missing-model.'),
      ),
    );
    assert.ok(
      errors.some((message) =>
        message.includes('Model binding garden-hero references unknown map missing-map.'),
      ),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('release validation shares runtime policy safety rules', async () => {
  const { gameRoot, temporaryRoot } = await copyGardenAssetInputs();
  try {
    const policyPath = path.join(gameRoot, 'assets/model-budget-policy.json');
    const originalPolicy = JSON.parse(await readFile(policyPath, 'utf8'));
    const invalidPolicies = [
      ['zero limit', { maxLoadedAssets: 0 }, /maxLoadedAssets.*positive integer/i],
      ['negative limit', { maxLoadedAssets: -1 }, /maxLoadedAssets.*positive integer/i],
      ['fractional limit', { maxLoadedAssets: 1.5 }, /maxLoadedAssets.*positive integer/i],
      ['excessive limit', { maxLoadedAssets: 65 }, /maxLoadedAssets.*64/],
      ['malformed limit type', { maxLoadedAssets: '4' }, /maxLoadedAssets.*positive integer/i],
      ['malformed allowance type', { allowUnapproved: 'false' }, /allowUnapproved.*boolean/i],
      [
        'per-asset limit above scene limit',
        { maxTrianglesPerAsset: 12_000, maxSceneTriangles: 10_000 },
        /per-asset triangle policy cannot exceed/i,
      ],
    ];

    for (const [label, runtimeOverrides, expectedError] of invalidPolicies) {
      const policy = structuredClone(originalPolicy);
      Object.assign(policy.runtimePolicy, runtimeOverrides);
      await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
      const errors = await validateGardenAssets({ gameRoot });
      assert.ok(
        errors.some((message) => expectedError.test(message)),
        `${label}: ${errors}`,
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
