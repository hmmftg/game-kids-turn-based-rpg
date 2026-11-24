import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import prettier from 'prettier';
import {
  addSpecifiedAsset,
  createAssetCatalog,
  serializeAssetCatalog,
  validateAssetCatalog,
} from 'waypoint-rpg-creator/asset-catalog';
import { ASSET_REGISTRY } from '../src/services/assets/registry.ts';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const OUTPUT = path.join(ROOT, 'assets', 'mahalle-asset-catalog.json');
const GAME_ID = 'mahalle-ye-mehrabani';
const USAGE = {
  'ball.glb': 'Physical ball prop used by the child micro-battle interaction.',
  'bench.glb': 'Walkable neighborhood furniture and resting landmark.',
  'bush.glb': 'Static vegetation used to dress outdoor areas.',
  'butterfly.glb': 'Animated critter used in the outdoor world.',
  'cat.glb': 'Animated cat character used in the outdoor world.',
  'crate.glb': 'Static crate prop used around the neighborhood.',
  'dog.glb': 'Static dog character used in the outdoor world.',
  'duck.glb': 'Static duck character used near water.',
  'elephant.glb': 'High-detail static critter shown on supported graphics tiers.',
  'farm-plot.glb': 'Garden landmark used in the outdoor world.',
  'fence.glb': 'Static boundary pieces used around outdoor landmarks.',
  'fountain.glb': 'Fountain landmark used in the neighborhood square.',
  'home-gate.glb': 'Home landmark with a physical door interaction target.',
  'koi.glb': 'Static fish character used at the river landmark.',
  'path-cobbled.glb': 'Static path tile used by the neighborhood ground.',
  'path-dirt.glb': 'Static path tile used by the neighborhood ground.',
  'rock.glb': 'Static rock landmark and environmental prop.',
  'rocks-small.glb': 'Small static rocks used as environmental props.',
  'rocks.glb': 'Static rock grouping used as an environmental landmark.',
  'shop.glb': 'Shop landmark used in the neighborhood market.',
  'streetlight.glb': 'Static streetlight landmark used in outdoor areas.',
  'tree-a.glb': 'Static tree landmark used in outdoor areas.',
  'tree-b.glb': 'Static tree landmark used in outdoor areas.',
  'tree-c.glb': 'Static tree landmark used in outdoor areas.',
};

function sourceProvider(entry) {
  const first = entry.source.split(' — ', 1)[0]?.trim();
  return first || 'Source needs review';
}

function triangleCount(primitive) {
  const count =
    primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
  switch (primitive.getMode()) {
    case 5:
    case 6:
      return Math.max(0, count - 2);
    case 0:
    case 1:
    case 2:
    case 3:
      return 0;
    default:
      return Math.floor(count / 3);
  }
}

async function assetMetrics(entry, io) {
  const absolutePath = path.join(ROOT, entry.file);
  const bytes = await readFile(absolutePath);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    actualHash,
    entry.sha256,
    `${entry.file} must match the shipped asset registry hash`,
  );

  const document = await io.read(absolutePath);
  const meshes = document.getRoot().listMeshes();
  const primitives = meshes.flatMap((mesh) => mesh.listPrimitives());
  return {
    runtimeBytes: (await stat(absolutePath)).size,
    triangleCount: primitives.reduce((total, primitive) => total + triangleCount(primitive), 0),
    vertexCount: primitives.reduce(
      (total, primitive) => total + (primitive.getAttribute('POSITION')?.getCount() ?? 0),
      0,
    ),
    meshCount: meshes.length,
    jointCount: document
      .getRoot()
      .listSkins()
      .reduce((total, skin) => total + skin.listJoints().length, 0),
    animationClipCount: document.getRoot().listAnimations().length,
    textureCount: document.getRoot().listTextures().length,
  };
}

export async function createMahalleAssetCatalog() {
  const io = new NodeIO();
  let catalog = createAssetCatalog();
  const modelEntries = ASSET_REGISTRY.filter((entry) => entry.type === 'model').toSorted((a, b) =>
    a.id.localeCompare(b.id),
  );

  for (const entry of modelEntries) {
    const filename = path.basename(entry.file);
    catalog = addSpecifiedAsset(catalog, {
      id: entry.id,
      category: 'static-model',
      description: USAGE[filename] ?? `World model used by the root game: ${filename}.`,
      consumerGameIds: [GAME_ID],
    });
    const metrics = await assetMetrics(entry, io);
    catalog = {
      ...catalog,
      assets: catalog.assets.map((asset) =>
        asset.id === entry.id
          ? {
              ...asset,
              // Creator readiness remains conservative: source packs are not
              // checked into this production game, so creator import review
              // is not implied by the root game's existing release gate.
              source: { provider: sourceProvider(entry), reference: entry.source },
              runtime: { path: entry.file, format: 'glb', sha256: entry.sha256 },
              rights: {
                licenseId: entry.license,
                ...(entry.licenseUrl ? { licenseUrl: entry.licenseUrl } : {}),
                attribution: entry.attribution,
                reviewState: entry.license === 'unknown' ? 'unverified' : 'root-registry-recorded',
                rootReleaseGateStatus: entry.status,
              },
              inspection: { format: 'glb', inspector: '@gltf-transform/core NodeIO' },
              budgets: metrics,
            }
          : asset,
      ),
    };
  }

  const diagnostics = validateAssetCatalog(catalog);
  assert.deepEqual(diagnostics, [], 'the creator package must accept the game asset catalog');
  return prettier.format(serializeAssetCatalog(catalog), { parser: 'json' });
}

export async function syncMahalleAssetCatalog(mode = 'check') {
  const expected = await createMahalleAssetCatalog();
  if (mode === 'write') {
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, expected, 'utf8');
    console.log(`Generated ${path.relative(ROOT, OUTPUT)} from the root asset registry.`);
    return;
  }

  const actual = await readFile(OUTPUT, 'utf8');
  assert.equal(
    actual,
    expected,
    'Mahalle creator catalog is stale; run npm run creator:mahalle-catalog:write.',
  );
  console.log('Mahalle creator catalog matches the shipped asset registry and GLB metrics.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  try {
    await syncMahalleAssetCatalog(mode);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
