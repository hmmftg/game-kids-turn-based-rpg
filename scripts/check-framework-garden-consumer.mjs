import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { cp, lstat, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { runNode, runNpm } from './framework-consumer-support.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const sampleRoot = path.join(repoRoot, 'examples', 'garden-adventure');
const frameworkPackages = [
  { name: 'waypoint-rpg-core', workspace: 'packages/core' },
  { name: 'waypoint-rpg-narrative', workspace: 'packages/narrative' },
  { name: 'waypoint-rpg-gameplay', workspace: 'packages/gameplay' },
  { name: 'waypoint-rpg-three', workspace: 'packages/three' },
];

async function packFrameworkPackage(artifactRoot, { name, workspace }) {
  const output = runNpm(
    [
      'pack',
      '--json',
      '--ignore-scripts',
      `--workspace=${workspace}`,
      '--pack-destination',
      artifactRoot,
    ],
    { cwd: repoRoot },
  );
  const results = JSON.parse(output);
  assert.equal(results.length, 1, `npm pack must produce exactly one ${name} archive`);
  assert.equal(results[0].name, name);
  return path.join(artifactRoot, results[0].filename);
}

async function installToolchain(consumerRoot) {
  const packagePath = path.join(consumerRoot, 'package.json');
  const lockPath = path.join(consumerRoot, 'package-lock.json');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));

  for (const { name, workspace } of frameworkPackages) {
    delete manifest.dependencies[name];
    delete lock.packages[''].dependencies[name];
    delete lock.packages[`node_modules/${name}`];
    delete lock.packages[`../../${workspace}`];
  }
  delete manifest.dependencies['mahalle-ye-mehrabani'];
  delete lock.packages[''].dependencies['mahalle-ye-mehrabani'];
  delete lock.packages['../..'];
  delete lock.packages['node_modules/mahalle-ye-mehrabani'];

  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumerRoot });
  log('Garden consumer development toolchain: locked npm ci passed');
}

async function installArchives(consumerRoot, artifactRoot, archives) {
  const packagePath = path.join(consumerRoot, 'package.json');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  for (const { name, archive } of archives) {
    manifest.dependencies[name] =
      `file:${path.relative(consumerRoot, archive).replaceAll(path.sep, '/')}`;
  }
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumerRoot,
  });

  const modulesRoot = await realpath(path.join(consumerRoot, 'node_modules'));
  for (const { name } of archives) {
    const packageRoot = await realpath(path.join(modulesRoot, name));
    assert.ok(
      packageRoot.startsWith(`${modulesRoot}${path.sep}`),
      `${name} must resolve from the independent consumer installation`,
    );
  }
  log('Garden consumer framework packages: local archives installed offline');
}

async function verifyEachArchiveIndependently(consumerRoot, temporaryRoot, archives) {
  const declarations = {
    'waypoint-rpg-core': `import { createGameRuntime, findPath, type WorldMap } from 'waypoint-rpg-core';\nvoid createGameRuntime; void findPath; const map: WorldMap | undefined = undefined; void map;\n`,
    'waypoint-rpg-narrative': `import { compileNarrative, createNarrativeState, decodeNarrativeState, getDialogueView, getFact, getQuestStatus, transitionNarrative, validateNarrative } from 'waypoint-rpg-narrative';\nvoid [compileNarrative, createNarrativeState, decodeNarrativeState, getDialogueView, getFact, getQuestStatus, transitionNarrative, validateNarrative];\n`,
    'waypoint-rpg-gameplay': `import { applyGameplayGrant, compileGameplay, createGameplayState, decodeGameplayState, encodeGameplayState, getCharacterLevel, getCharacterAttributes, getEffectiveCharacterAttributes, getInventorySlotCount, getUnlockedAbilityIds, transitionGameplay, validateGameplay } from 'waypoint-rpg-gameplay';\nvoid [applyGameplayGrant, compileGameplay, createGameplayState, decodeGameplayState, encodeGameplayState, getCharacterLevel, getCharacterAttributes, getEffectiveCharacterAttributes, getInventorySlotCount, getUnlockedAbilityIds, transitionGameplay, validateGameplay];\n`,
    'waypoint-rpg-three': `import { animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord } from 'waypoint-rpg-three';\nvoid [animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord];\n`,
  };

  for (const archive of archives) {
    const probeRoot = path.join(temporaryRoot, `probe-${archive.name}`);
    await mkdir(probeRoot, { recursive: true });
    await writeFile(
      path.join(probeRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: `garden-consumer-${archive.name}`,
          private: true,
          type: 'module',
          dependencies: {
            [archive.name]: `file:${path.relative(probeRoot, archive.archive).replaceAll(path.sep, '/')}`,
            ...(archive.name === 'waypoint-rpg-three'
              ? {
                  three: `file:${path
                    .relative(probeRoot, path.resolve(repoRoot, 'node_modules/three'))
                    .replaceAll(path.sep, '/')}`,
                  '@types/three': `file:${path
                    .relative(probeRoot, path.resolve(repoRoot, 'node_modules/@types/three'))
                    .replaceAll(path.sep, '/')}`,
                }
              : {}),
          },
        },
        null,
        2,
      )}\n`,
    );
    runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: probeRoot,
    });
    await writeFile(path.join(probeRoot, 'consumer.ts'), declarations[archive.name]);
    runNode(
      [
        '--input-type=module',
        '-e',
        `const api = await import('${archive.name}'); if (!Object.keys(api).length) process.exit(1);`,
      ],
      { cwd: probeRoot },
    );
    const compiler = path.join(consumerRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    for (const [module, resolution] of [
      ['NodeNext', 'NodeNext'],
      ['ESNext', 'Bundler'],
    ]) {
      runNode(
        [
          compiler,
          '--noEmit',
          '--strict',
          '--target',
          'ES2022',
          '--module',
          module,
          '--moduleResolution',
          resolution,
          'consumer.ts',
        ],
        { cwd: probeRoot },
      );
    }
    log(`${archive.name}: isolated installed ESM and NodeNext/Bundler declarations passed`);
  }
}

async function checkPublicImports(consumerRoot) {
  const sourceRoot = path.join(consumerRoot, 'src');
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile() || !/\.[jt]sx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()["']waypoint-rpg-(?:core|narrative|gameplay|three)\//,
      `Framework deep imports are not public APIs: ${path.relative(consumerRoot, file)}`,
    );
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()["'][^"']*(?:scene-demo|src\/framework|packages\/(?:core|narrative|gameplay|three)\/src)/,
      `The sample must not import repository-private implementation: ${path.relative(consumerRoot, file)}`,
    );
  }
}

export async function checkFrameworkGardenConsumer() {
  const temporaryRoot = await mkdtemp(path.join(await realpath(os.tmpdir()), 'waypoint-garden-'));
  const consumerRoot = path.join(temporaryRoot, 'consumer');
  const artifactRoot = path.join(temporaryRoot, 'artifacts');

  try {
    await mkdir(artifactRoot, { recursive: true });
    await cp(sampleRoot, consumerRoot, {
      recursive: true,
      filter: (source) =>
        !source
          .split(path.sep)
          .some((part) =>
            ['node_modules', 'dist', 'playwright-report', 'test-results'].includes(part),
          ),
    });

    const archives = [];
    for (const frameworkPackage of frameworkPackages) {
      archives.push({
        ...frameworkPackage,
        archive: await packFrameworkPackage(artifactRoot, frameworkPackage),
      });
    }

    await installToolchain(consumerRoot);
    await installArchives(consumerRoot, artifactRoot, archives);
    await checkPublicImports(consumerRoot);

    runNode(
      [
        '--input-type=module',
        '-e',
        "import { createGameRuntime, findPath } from 'waypoint-rpg-core'; import { compileNarrative, validateNarrative } from 'waypoint-rpg-narrative'; import { animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord } from 'waypoint-rpg-three'; if (![createGameRuntime, findPath, compileNarrative, validateNarrative, animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord].every((item) => typeof item === 'function')) process.exit(1);",
      ],
      { cwd: consumerRoot },
    );
    runNpm(['run', 'typecheck'], { cwd: consumerRoot });
    runNpm(['run', 'test'], { cwd: consumerRoot });
    runNpm(['run', 'build'], { cwd: consumerRoot });
    await verifyEachArchiveIndependently(consumerRoot, temporaryRoot, archives);

    if (process.env['FRAMEWORK_INSTALL_CHROMIUM']) {
      const installArgs = ['exec', '--', 'playwright', 'install'];
      if (process.env['FRAMEWORK_INSTALL_CHROMIUM'] === '1') installArgs.push('--with-deps');
      installArgs.push('chromium');
      runNpm(installArgs, { cwd: consumerRoot });
    }

    runNpm(['run', 'test:e2e'], { cwd: consumerRoot });
    log(
      'framework Garden consumer: independent source copy, locked toolchain, offline core+narrative+gameplay+three archives, isolated ESM/declaration probes, tests, production build, and Chromium smoke passed',
    );
  } catch (error) {
    try {
      await preserveGardenConsumerDiagnostics(consumerRoot);
    } catch (diagnosticsError) {
      logError('Could not preserve Garden consumer diagnostics:', diagnosticsError);
    }
    throw error;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function preserveGardenConsumerDiagnostics(consumerRoot) {
  const output = process.env['FRAMEWORK_GARDEN_DIAGNOSTICS_OUTPUT'];
  if (!output) return;
  const outputRoot = path.resolve(output);
  await mkdir(outputRoot, { recursive: true });
  for (const name of ['playwright-report', 'test-results']) {
    const source = path.join(consumerRoot, name);
    try {
      await lstat(source);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    await cp(source, path.join(outputRoot, name), { recursive: true, force: true });
  }
  log(`Garden consumer diagnostics copied to ${outputRoot}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkFrameworkGardenConsumer();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
