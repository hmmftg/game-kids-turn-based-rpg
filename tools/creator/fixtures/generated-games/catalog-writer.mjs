import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import {
  addSpecifiedAsset,
  createAssetCatalog,
  markAssetSourced,
  markAssetValidated,
  recordAssetImport,
  serializeAssetCatalog,
  verifyAssetFiles,
} from 'waypoint-rpg-creator/asset-catalog';

const [projectRoot, gameId] = process.argv.slice(2);
assert.ok(projectRoot && gameId, 'Expected project directory and game ID.');
const records = JSON.parse(await readFile(join(projectRoot, 'assets/asset-records.json'), 'utf8'));
assert.equal(records.length, 2, 'Expected the shared and game-local imported models.');
let catalog = createAssetCatalog();

for (const record of records) {
  const isShared = record.id === 'shared-courtyard-marker';
  const evidencePath = `assets/evidence/${record.id}.txt`;
  catalog = addSpecifiedAsset(catalog, {
    id: record.id,
    category: 'static-model',
    description: isShared ? 'Shared synthetic marker fixture.' : `Local fixture for ${gameId}.`,
    consumerGameIds: isShared ? ['generated-narrative-only', 'generated-tactical-only'] : [gameId],
  });
  catalog = markAssetSourced(catalog, record.id, {
    provider: 'local-repository-fixture',
    reference: record.sourceOrigin,
    originalPath: `assets/original/${record.id}.glb`,
    originalSha256: record.sourceSha256,
  });
  catalog = recordAssetImport(catalog, record.id, {
    runtimePath: `public/models/${record.id}.glb`,
    runtimeSha256: record.outputSha256,
    rights: {
      licenseId: record.rights.licenseId,
      attribution: record.rights.attribution,
      commercialUse: record.rights.commercialUse,
      redistribution: record.rights.redistribution,
      evidencePath,
    },
    conversion: {
      tool: record.importer,
      version: record.importerVersion,
      options: record.conversionOptions,
    },
    inspection: {
      geometry: { triangles: record.metrics.triangles, primitives: record.metrics.primitiveCount },
      materials: record.materialNames,
      textures: await inspectTextures(projectRoot, record),
      bones: record.metrics.jointCount,
      morphTargets: record.metrics.morphTargetNames,
      animations: record.clipInventory,
      normalization: {
        metersPerUnit: record.normalization.metersPerUnit,
        upAxis: record.normalization.upAxis,
        forwardAxis: record.normalization.forwardAxis,
      },
      warnings: record.warnings,
      compatibilityNotes: ['Fixture preview catalog; release approval remains unset.'],
    },
    budgets: { maxTriangles: 100000, maxTextureDimension: 4096, maxFileBytes: 32000000 },
  });
  catalog = markAssetValidated(catalog, record.id, {
    validatedBy: 'waypoint-rpg-creator/import-consumer-gate',
    checks: [
      { id: 'glb-import', passed: true, evidence: 'Local GLB passed the shared importer.' },
      {
        id: 'hash-integrity',
        passed: true,
        evidence: 'Original and runtime hashes were recorded.',
      },
    ],
  });
}

assert.deepEqual(await verifyAssetFiles(catalog, projectRoot), []);
await writeFile(join(projectRoot, 'assets/catalog.json'), serializeAssetCatalog(catalog));
console.log(`Validated ${records.length} generated-consumer assets for ${gameId}.`);

async function inspectTextures(root, record) {
  const bytes = await readFile(join(root, 'public/models', `${record.id}.glb`));
  const document = await new NodeIO().readBinary(bytes);
  return document
    .getRoot()
    .listTextures()
    .map((texture) => {
      const image = Buffer.from(texture.getImage() ?? []);
      if (texture.getMimeType() === 'image/png' && image.byteLength >= 24) {
        assert.equal(image.toString('hex', 0, 8), '89504e470d0a1a0a');
        return {
          width: image.readUInt32BE(16),
          height: image.readUInt32BE(20),
          format: 'image/png',
        };
      }
      throw new Error(
        `Fixture texture format is not covered by this consumer gate: ${texture.getMimeType()}.`,
      );
    });
}
