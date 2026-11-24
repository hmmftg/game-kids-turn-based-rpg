import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runNode, runNpm } from './framework-consumer-support.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageLock = JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8'));
const creatorManifest = JSON.parse(
  await readFile(join(repositoryRoot, 'tools/creator/package.json'), 'utf8'),
);
const packageRoots = [
  { name: 'waypoint-rpg-core', workspace: 'packages/core' },
  { name: 'waypoint-rpg-narrative', workspace: 'packages/narrative' },
  { name: 'waypoint-rpg-gameplay', workspace: 'packages/gameplay' },
  { name: 'waypoint-rpg-creator', workspace: 'tools/creator' },
];
const fixtureRoot = join(repositoryRoot, 'tools/creator/fixtures/generated-games');
const modelFixture = join(
  repositoryRoot,
  'examples/scene-demo/fixtures/model-source/static-textured.glb',
);
const temporaryRoot = await mkdtemp(join(await realpath(tmpdir()), 'waypoint-generated-games-'));
const archiveDirectory = join(temporaryRoot, 'archives');
const creatorHost = join(temporaryRoot, 'creator-host');
const narrativeProject = join(temporaryRoot, 'narrative-only');
const tacticalProject = join(temporaryRoot, 'tactical-only');

function isWithin(root, path) {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function resolvePackageKey(name, ownerKey = '') {
  let directory = ownerKey;
  while (true) {
    const candidate = directory ? `${directory}/node_modules/${name}` : `node_modules/${name}`;
    if (packageLock.packages[candidate]) return candidate;
    if (!directory) return null;
    const separator = directory.lastIndexOf('/');
    directory = separator < 0 ? '' : directory.slice(0, separator);
  }
}

function createCreatorHostLock(creatorArchive) {
  const selected = new Set();
  const queue = [];
  function enqueue(name, ownerKey = 'tools/creator', optional = false) {
    const key = resolvePackageKey(name, ownerKey);
    if (!key) {
      if (optional) return;
      throw new Error(`Missing creator host dependency ${name} from ${ownerKey}.`);
    }
    const entry = packageLock.packages[key];
    assert.equal(entry.link, undefined, `Creator host must not use workspace link ${key}.`);
    if (!selected.has(key)) {
      selected.add(key);
      queue.push(key);
    }
  }

  for (const name of Object.keys(creatorManifest.dependencies ?? {})) enqueue(name);
  while (queue.length > 0) {
    const ownerKey = queue.shift();
    const entry = packageLock.packages[ownerKey];
    for (const name of Object.keys(entry.dependencies ?? {})) enqueue(name, ownerKey);
    for (const name of Object.keys(entry.optionalDependencies ?? {})) enqueue(name, ownerKey, true);
    for (const name of Object.keys(entry.peerDependencies ?? {}))
      enqueue(name, ownerKey, entry.peerDependenciesMeta?.[name]?.optional === true);
  }

  const packages = Object.fromEntries(
    [...selected].sort().map((key) => [key, packageLock.packages[key]]),
  );
  const relativeArchive = `file:${relative(creatorHost, creatorArchive).replaceAll('\\', '/')}`;
  const integrity = `sha512-${createHash('sha512').update(requireArchiveBytes(creatorArchive)).digest('base64')}`;
  packages['node_modules/waypoint-rpg-creator'] = {
    version: creatorManifest.version,
    resolved: relativeArchive,
    integrity,
    dependencies: creatorManifest.dependencies,
    engines: creatorManifest.engines,
  };
  return {
    name: 'waypoint-rpg-generated-consumer-host',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'waypoint-rpg-generated-consumer-host',
        version: '1.0.0',
        dependencies: { 'waypoint-rpg-creator': relativeArchive },
      },
      ...packages,
    },
  };
}

let creatorArchiveBytes;
function requireArchiveBytes(archivePath) {
  if (creatorArchiveBytes) return creatorArchiveBytes;
  throw new Error(`Archive bytes must be loaded before lock generation: ${archivePath}.`);
}

async function packFrameworkArchives() {
  await mkdir(archiveDirectory, { recursive: true });
  runNpm(['run', 'framework:build'], { cwd: repositoryRoot });
  runNpm(['run', 'creator:build'], { cwd: repositoryRoot });
  const archives = {};
  for (const entry of packageRoots) {
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, entry.workspace, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.name, entry.name);
    runNpm(
      [
        'pack',
        '--ignore-scripts',
        `--workspace=${entry.workspace}`,
        '--pack-destination',
        archiveDirectory,
      ],
      { cwd: repositoryRoot },
    );
    archives[entry.name] = join(archiveDirectory, `${manifest.name}-${manifest.version}.tgz`);
  }
  creatorArchiveBytes = await readFile(archives['waypoint-rpg-creator']);
  return archives;
}

async function prepareCreatorHost(creatorArchive) {
  await mkdir(creatorHost, { recursive: true });
  const archive = await readFile(creatorArchive);
  creatorArchiveBytes = archive;
  const lock = createCreatorHostLock(creatorArchive);
  const packageJson = {
    name: lock.name,
    version: lock.version,
    private: true,
    type: 'module',
    dependencies: lock.packages[''].dependencies,
  };
  await writeFile(join(creatorHost, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(join(creatorHost, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  runNpm(['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: creatorHost });
  return join(creatorHost, 'node_modules/waypoint-rpg-creator/src/cli.mjs');
}

async function generateProject({
  cli,
  directory,
  id,
  displayName,
  packages,
  locales,
  defaultLocale,
  archives,
}) {
  const command = [
    cli,
    'game',
    'create',
    '--directory',
    directory,
    '--id',
    id,
    '--name',
    displayName,
    '--packages',
    packages.join(','),
    '--locales',
    locales.join(','),
    '--default-locale',
    defaultLocale,
    '--core-tarball',
    archives['waypoint-rpg-core'],
  ];
  if (packages.includes('narrative'))
    command.push('--narrative-tarball', archives['waypoint-rpg-narrative']);
  if (packages.includes('gameplay'))
    command.push('--gameplay-tarball', archives['waypoint-rpg-gameplay']);
  runNode(command, { cwd: creatorHost });
}

async function importConsumerAssets({ cli, project, gameId, localAssetId }) {
  const metadataDirectory = join(project, 'assets/source-metadata');
  const originalDirectory = join(project, 'assets/original');
  const evidenceDirectory = join(project, 'assets/evidence');
  await Promise.all(
    [metadataDirectory, originalDirectory, evidenceDirectory].map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );
  for (const id of ['shared-courtyard-marker', localAssetId]) {
    const sourcePath = join(originalDirectory, `${id}.glb`);
    await cp(modelFixture, sourcePath);
    const metadata = {
      id,
      sourceOrigin: 'Procedural static textured fixture generated in this repository.',
      rights: {
        licenseId: 'MIT',
        attribution: 'Synthetic fixture authored in this repository under the root MIT license.',
        commercialUse: true,
        redistribution: true,
        approved: false,
      },
      normalization: { metersPerUnit: 1, sourceUpAxis: 'Y', sourceForwardAxis: '-Z' },
      clips: {},
      fallbackAction: 'static',
    };
    const metadataPath = join(metadataDirectory, `${id}.json`);
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(
      join(evidenceDirectory, `${id}.txt`),
      'Synthetic fixture generated by this repository; license terms are in the root LICENSE file.\n',
    );
    runNode(
      [
        cli,
        'asset',
        'import',
        '--source',
        sourcePath,
        '--metadata',
        metadataPath,
        '--output-directory',
        join(project, 'public/models'),
        '--manifest',
        join(project, 'assets/asset-records.json'),
      ],
      { cwd: project },
    );
  }
  const manifestPath = join(project, 'game.project.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.assets.references = [
    {
      assetId: 'shared-courtyard-marker',
      source: 'shared',
      runtimePath: 'public/models/shared-courtyard-marker.glb',
    },
    {
      assetId: localAssetId,
      source: 'game-local',
      runtimePath: `public/models/${localAssetId}.glb`,
    },
  ];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const catalogWriter = join(fixtureRoot, 'catalog-writer.mjs');
  const hostCatalogWriter = join(creatorHost, 'catalog-writer.mjs');
  await cp(catalogWriter, hostCatalogWriter);
  runNode([hostCatalogWriter, project, gameId], { cwd: creatorHost });
}

async function writeProjectManifest(
  project,
  { narrative = false, gameplay = false, direction = 'ltr' },
) {
  const manifestPath = join(project, 'game.project.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.content.narrativeDefinitionPath = narrative ? 'src/story.ts' : null;
  manifest.content.gameplayDefinitionPath = gameplay ? 'src/gameplay.ts' : null;
  manifest.accessibility.direction = direction;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const htmlPath = join(project, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  await writeFile(htmlPath, html.replace(/dir="(?:auto|ltr|rtl)"/u, `dir="${direction}"`));
}

async function listFilesRecursively(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFilesRecursively(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function checkNoWorkspaceOrDeepImports(project, selectedPackages) {
  const manifest = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
  assert.equal(manifest.workspaces, undefined);
  for (const packageName of [
    'waypoint-rpg-core',
    'waypoint-rpg-narrative',
    'waypoint-rpg-gameplay',
  ]) {
    const selected = selectedPackages.includes(packageName);
    assert.equal(Boolean(manifest.dependencies[packageName]), selected);
    assert.equal(
      await import('node:fs/promises').then(({ access }) =>
        access(join(project, 'node_modules', packageName))
          .then(() => true)
          .catch(() => false),
      ),
      selected,
    );
  }
  assert.equal(manifest.dependencies['waypoint-rpg-creator'], undefined);
  const files = await listFilesRecursively(join(project, 'src'));
  const sourceImport =
    /(?:from\s*|import\s*\()\s*['"](?:\.\.\/)*(?:packages\/|examples\/(?:scene-demo|garden-adventure)|waypoint-rpg-(?:core|narrative|gameplay)\/(?:src|dist)\/)/u;
  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    assert.equal(sourceImport.test(contents), false, `Private/workspace import found in ${file}.`);
  }
  const privateImports = selectedPackages.map((name) => `${name}/dist/index.js`);
  const code = `import assert from 'node:assert/strict';
for (const packageName of ${JSON.stringify(selectedPackages)}) await import(packageName);
for (const path of ${JSON.stringify(privateImports)}) await assert.rejects(import(path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });`;
  runNode(['--input-type=module', '-e', code], { cwd: project });
}

async function checkDeclarations(project, gameKind) {
  const source =
    gameKind === 'narrative'
      ? `import { createGameRuntime } from 'waypoint-rpg-core';
import { createNarrativeState, type NarrativeCommand, type NarrativeDefinition } from 'waypoint-rpg-narrative';
import { compiledStory, storyDefinition } from './src/story.js';
const definition: NarrativeDefinition = storyDefinition;
const state = createNarrativeState(compiledStory, 'typed-playthrough');
const command: NarrativeCommand = { type: 'open-dialogue', dialogueId: 'traveler-question', playthroughId: state.playthroughId, expectedRevision: state.revision };
const runtimeFactory: typeof createGameRuntime = createGameRuntime;
void definition; void command; void runtimeFactory;`
      : `import { createGameRuntime } from 'waypoint-rpg-core';
import { compileGameplay, createGameplayState, type GameplayCommand, type GameplayDefinition } from 'waypoint-rpg-gameplay';
import { gameplayDefinition } from './src/gameplay.js';
const definition: GameplayDefinition = gameplayDefinition;
const compiled = compileGameplay(definition);
const state = createGameplayState(compiled, 'typed-playthrough');
const command: GameplayCommand = { type: 'start-encounter', encounterId: 'practice-duel', instanceId: 'type-check-duel', playthroughId: state.playthroughId, expectedRevision: state.revision };
const runtimeFactory: typeof createGameRuntime = createGameRuntime;
void command; void runtimeFactory;`;
  const fixture = join(project, 'consumer-public-api.mts');
  await writeFile(fixture, `${source}\n`);
  const common = [
    '--noEmit',
    '--ignoreConfig',
    '--strict',
    '--skipLibCheck',
    '--target',
    'ES2022',
    '--moduleResolution',
  ];
  runNpm(['exec', '--', 'tsc', ...common, 'NodeNext', '--module', 'NodeNext', fixture], {
    cwd: project,
  });
  runNpm(['exec', '--', 'tsc', ...common, 'Bundler', '--module', 'ESNext', fixture], {
    cwd: project,
  });
}

async function validateWithPackedCreator(cli, project) {
  const output = runNode([cli, 'game', 'validate', project], { cwd: creatorHost });
  assert.match(output, /"ok": true/u);
}

async function executeGeneratedGame({ cli, project, kind, selectedPackages }) {
  await validateWithPackedCreator(cli, project);
  runNpm(['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: project });
  await checkNoWorkspaceOrDeepImports(project, selectedPackages);
  await checkDeclarations(project, kind);
  runNpm(['run', 'build'], { cwd: project });
  runNpm(['test'], { cwd: project });
  runNpm(['run', 'capture'], { cwd: project });
}

async function copyRenderedScreenshot(project, fileName, destination) {
  const screenshots = (await listFilesRecursively(join(project, 'test-results'))).filter((path) =>
    path.endsWith(fileName),
  );
  assert.equal(screenshots.length, 1, `Expected exactly one ${fileName} screenshot.`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(screenshots[0], destination);
}

try {
  assert.equal(isWithin(temporaryRoot, narrativeProject), true);
  assert.equal(
    isWithin(repositoryRoot, temporaryRoot),
    false,
    'Generated consumers must be outside the checkout.',
  );
  const archives = await packFrameworkArchives();
  const creatorCli = await prepareCreatorHost(archives['waypoint-rpg-creator']);

  await generateProject({
    cli: creatorCli,
    directory: narrativeProject,
    id: 'generated-narrative-only',
    displayName: 'راهِ روشن',
    packages: ['core', 'narrative'],
    locales: ['fa-IR', 'en'],
    defaultLocale: 'fa-IR',
    archives,
  });
  await cp(join(fixtureRoot, 'narrative-only'), narrativeProject, { recursive: true, force: true });
  await writeProjectManifest(narrativeProject, { narrative: true, direction: 'rtl' });
  await importConsumerAssets({
    cli: creatorCli,
    project: narrativeProject,
    gameId: 'generated-narrative-only',
    localAssetId: 'narrative-local-marker',
  });

  await generateProject({
    cli: creatorCli,
    directory: tacticalProject,
    id: 'generated-tactical-only',
    displayName: 'Wayfinder’s Trial',
    packages: ['core', 'gameplay'],
    locales: ['en'],
    defaultLocale: 'en',
    archives,
  });
  await cp(join(fixtureRoot, 'tactical-only'), tacticalProject, { recursive: true, force: true });
  await writeProjectManifest(tacticalProject, { gameplay: true, direction: 'ltr' });
  await importConsumerAssets({
    cli: creatorCli,
    project: tacticalProject,
    gameId: 'generated-tactical-only',
    localAssetId: 'tactical-local-marker',
  });

  await executeGeneratedGame({
    cli: creatorCli,
    project: narrativeProject,
    kind: 'narrative',
    selectedPackages: ['waypoint-rpg-core', 'waypoint-rpg-narrative'],
  });
  await executeGeneratedGame({
    cli: creatorCli,
    project: tacticalProject,
    kind: 'tactical',
    selectedPackages: ['waypoint-rpg-core', 'waypoint-rpg-gameplay'],
  });

  const previewRoot = join(repositoryRoot, 'docs/previews/creator');
  await copyRenderedScreenshot(
    narrativeProject,
    'narrative-truth-ending.png',
    join(previewRoot, 'generated-narrative-consumer.png'),
  );
  await copyRenderedScreenshot(
    tacticalProject,
    'tactical-victory.png',
    join(previewRoot, 'generated-tactical-consumer.png'),
  );
  const narrativeCatalog = JSON.parse(
    await readFile(join(narrativeProject, 'assets/catalog.json'), 'utf8'),
  );
  const tacticalCatalog = JSON.parse(
    await readFile(join(tacticalProject, 'assets/catalog.json'), 'utf8'),
  );
  const sharedNarrative = narrativeCatalog.assets.find(
    (asset) => asset.id === 'shared-courtyard-marker',
  );
  const sharedTactical = tacticalCatalog.assets.find(
    (asset) => asset.id === 'shared-courtyard-marker',
  );
  assert.deepEqual(
    sharedNarrative,
    sharedTactical,
    'Shared catalog record should be identical in both generated games.',
  );
  assert.deepEqual(sharedNarrative.consumerGameIds, [
    'generated-narrative-only',
    'generated-tactical-only',
  ]);
  assert.equal(
    narrativeCatalog.approvals.length,
    0,
    'Technical validation must not imply release approval.',
  );
  assert.equal(
    tacticalCatalog.approvals.length,
    0,
    'Technical validation must not imply release approval.',
  );
  console.log(`Generated narrative consumer outside checkout: ${narrativeProject}`);
  console.log(`Generated tactical consumer outside checkout: ${tacticalProject}`);
  console.log(
    'Generated consumers passed packed-package, type, build, unit, asset, and Chromium acceptance gates.',
  );
} finally {
  const resolvedRoot = resolve(temporaryRoot);
  const systemTemp = resolve(await realpath(tmpdir()));
  assert.ok(
    isWithin(systemTemp, resolvedRoot),
    `Refusing cleanup outside the system temp root: ${resolvedRoot}`,
  );
  assert.ok(resolvedRoot.split(sep).at(-1)?.startsWith('waypoint-generated-games-'));
  await rm(resolvedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
