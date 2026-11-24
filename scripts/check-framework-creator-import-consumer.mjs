import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNode, runNpm } from './framework-consumer-support.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureRoot = join(repositoryRoot, 'examples/scene-demo/fixtures/model-source');
const workspace = await mkdtemp(join(tmpdir(), 'waypoint-creator-import-consumer-'));
const archiveDirectory = join(workspace, 'archives');
const consumer = join(workspace, 'game with spaces');

try {
  await mkdir(archiveDirectory, { recursive: true });
  await mkdir(consumer, { recursive: true });
  runNpm(
    [
      'pack',
      '--ignore-scripts',
      '--workspace=tools/creator',
      '--pack-destination',
      archiveDirectory,
    ],
    { cwd: repositoryRoot },
  );
  runNpm(
    [
      'pack',
      '--ignore-scripts',
      '--workspace=packages/core',
      '--pack-destination',
      archiveDirectory,
    ],
    { cwd: repositoryRoot },
  );
  const archive = join(archiveDirectory, 'waypoint-rpg-creator-0.1.0.tgz');
  const coreArchive = join(archiveDirectory, 'waypoint-rpg-core-0.1.0.tgz');
  await cp(join(repositoryRoot, 'package.json'), join(consumer, 'package.json'));
  await cp(join(repositoryRoot, 'package-lock.json'), join(consumer, 'package-lock.json'));
  const packagePath = join(consumer, 'package.json');
  const lockPath = join(consumer, 'package-lock.json');
  const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'));
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  delete packageManifest.workspaces;
  delete lock.packages[''].workspaces;
  for (const [name, workspacePath] of [
    ['waypoint-rpg-core', 'packages/core'],
    ['waypoint-rpg-narrative', 'packages/narrative'],
    ['waypoint-rpg-gameplay', 'packages/gameplay'],
    ['waypoint-rpg-creator', 'tools/creator'],
  ]) {
    delete packageManifest.dependencies[name];
    delete lock.packages[''].dependencies[name];
    delete lock.packages[`node_modules/${name}`];
    delete lock.packages[workspacePath];
  }
  await writeFile(packagePath, `${JSON.stringify(packageManifest, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer });
  runNpm(['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer });
  runNpm(
    ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-save', archive],
    { cwd: consumer },
  );
  assert.equal(existsSync(join(consumer, 'node_modules/waypoint-rpg-gameplay')), false);
  runNode(
    [
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';
import { createAssetCatalog } from 'waypoint-rpg-creator';
import { serializeAssetCatalog, parseAssetCatalog } from 'waypoint-rpg-creator/asset-catalog';
import { createGameProject, createGameProjectManifest, validateGameProject } from 'waypoint-rpg-creator/game-project';
const encoded = serializeAssetCatalog(createAssetCatalog());
assert.deepEqual(parseAssetCatalog(encoded), { schemaVersion: 1, assets: [], approvals: [] });
const temp = await (await import('node:fs/promises')).mkdtemp((await import('node:path')).join((await import('node:os')).tmpdir(), 'creator-template-tarball-'));
try {
  const project = (await import('node:path')).join(temp, 'generated sample');
  const manifest = createGameProjectManifest({ id: 'outside-consumer', displayName: 'Outside consumer' });
  assert.equal(manifest.start.anchorId, 'anchor-spawn');
  await createGameProject({ directory: project, id: manifest.game.id, displayName: manifest.game.displayName,
    frameworkArchives: { 'waypoint-rpg-core': ${JSON.stringify(coreArchive)} } });
  assert.equal((await validateGameProject(project)).ok, true);
} finally { await (await import('node:fs/promises')).rm(temp, { recursive: true, force: true }); }
await assert.rejects(import('waypoint-rpg-creator/src/asset-catalog.mjs'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });`,
    ],
    { cwd: consumer },
  );
  const declarationFixture = join(consumer, 'creator-api.mts');
  await writeFile(
    declarationFixture,
    `import { createAssetCatalog, addSpecifiedAsset, serializeAssetCatalog } from 'waypoint-rpg-creator';
import { createGameProjectManifest, validateGameProjectManifest, type GameProjectManifest } from 'waypoint-rpg-creator/game-project';
const catalog = addSpecifiedAsset(createAssetCatalog(), {
  id: 'preview-guardian',
  category: 'animated-model',
  description: 'A locally inspected character.',
  consumerGameIds: ['sample-game'],
});
const bytes: string = serializeAssetCatalog(catalog);
const project: GameProjectManifest = createGameProjectManifest({ id: 'typed-project', displayName: 'Typed project' });
const valid: boolean = validateGameProjectManifest(project).ok;
void bytes;
void valid;
`,
  );
  runNpm(
    [
      'exec',
      '--',
      'tsc',
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      declarationFixture,
    ],
    { cwd: consumer },
  );
  runNpm(
    [
      'exec',
      '--',
      'tsc',
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      declarationFixture,
    ],
    { cwd: consumer },
  );

  const sourceDirectory = join(consumer, 'downloads');
  await mkdir(sourceDirectory);
  for (const name of [
    'static-textured.glb',
    'static-textured.asset.json',
    'rigged-animated.glb',
    'rigged-animated.asset.json',
  ]) {
    await copyFile(join(fixtureRoot, name), join(sourceDirectory, name));
  }
  const cli = join(consumer, 'node_modules/waypoint-rpg-creator/src/cli.mjs');
  for (const id of ['static-textured', 'rigged-animated']) {
    const filePrefix = id;
    const output = runNode(
      [
        cli,
        'asset',
        'import',
        '--source',
        join(sourceDirectory, `${filePrefix}.glb`),
        '--metadata',
        join(sourceDirectory, `${filePrefix}.asset.json`),
        '--output-directory',
        join(consumer, 'public/models'),
        '--manifest',
        join(consumer, 'assets/asset-records.json'),
      ],
      { cwd: consumer },
    );
    assert.match(output, /Output SHA-256: [0-9a-f]{64}/);
  }

  const manifest = JSON.parse(await readFile(join(consumer, 'assets/asset-records.json'), 'utf8'));
  assert.deepEqual(
    manifest.map((record) => record.id),
    ['phase5-animated-guardian', 'phase5-textured-static'],
  );
  assert.ok(
    manifest.find((record) => record.id === 'phase5-animated-guardian').metrics.jointCount > 0,
  );
  console.log('creator importer tarball: offline install and static/rigged local imports passed');
} finally {
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
