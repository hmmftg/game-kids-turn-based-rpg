import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { importMeshyPilot, MESHY_PILOT_ASSETS } from './import-meshy-pilot.mjs';

const sourceDirectory = process.env['WAYPOINT_MESHY_SOURCE_DIR'];

test(
  'imports all five local Meshy GLBs unchanged under the explicit pilot budget',
  { skip: !sourceDirectory && 'Set WAYPOINT_MESHY_SOURCE_DIR to run the private model test.' },
  async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'waypoint-meshy-pilot-test-'));
    try {
      const result = await importMeshyPilot({ sourceDirectory, outputDirectory });
      assert.deepEqual(result.failures, []);
      assert.equal(result.records.length, MESHY_PILOT_ASSETS.length);

      const records = JSON.parse(
        await readFile(join(outputDirectory, 'asset-records.json'), 'utf8'),
      );
      const catalog = JSON.parse(
        await readFile(join(outputDirectory, 'asset-catalog.json'), 'utf8'),
      );
      assert.equal(records.length, 5);
      assert.equal(catalog.approvals.length, 0);
      assert.ok(catalog.assets.every((asset) => asset.stage === 'validated'));
      assert.ok(records.every((record) => record.rights.approved === false));

      for (const asset of MESHY_PILOT_ASSETS) {
        const record = records.find(({ id }) => id === asset.id);
        const catalogAsset = catalog.assets.find(({ id }) => id === asset.id);
        const original = await readFile(join(sourceDirectory, asset.sourceFilename));
        const runtime = await readFile(join(outputDirectory, 'models', `${asset.id}.glb`));
        assert.equal(catalogAsset?.budgets.maxTriangles, asset.preferredTriangles);
        assert.equal(catalogAsset?.budgets.maxFileBytes, asset.preferredBytes);
        assert.equal(catalogAsset?.budgets.localPilotTriangleLimit, 400_000);
        assert.ok(catalogAsset?.inspection.warnings.length > 0);
        assert.deepEqual(runtime, original, asset.id);
        assert.equal(record.sourceSha256, record.outputSha256, asset.id);
        assert.equal(record.metrics.triangles <= 400_000, true, asset.id);
      }
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  },
);
