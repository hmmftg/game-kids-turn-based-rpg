import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runNode, runNpm } from './framework-consumer-support.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
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

async function copyApplication(consumerRoot) {
  const excludedDirectories = new Set([
    '.git',
    '.worktrees',
    '.superpowers',
    '.plans',
    '.codex',
    'node_modules',
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'packages',
    'tools',
  ]);
  await cp(repoRoot, consumerRoot, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(repoRoot, source);
      if (relative === '') return true;
      const first = relative.split(path.sep)[0];
      return !excludedDirectories.has(first);
    },
  });
}

async function removeWorkspaceLinks(consumerRoot) {
  const manifestPath = path.join(consumerRoot, 'package.json');
  const lockPath = path.join(consumerRoot, 'package-lock.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  delete manifest.workspaces;

  const removedPackages = new Set(['waypoint-rpg-creator']);
  for (const { name } of frameworkPackages) removedPackages.add(name);
  for (const name of removedPackages) {
    delete manifest.dependencies?.[name];
    delete manifest.devDependencies?.[name];
    delete lock.packages[''].dependencies?.[name];
    delete lock.packages[''].devDependencies?.[name];
    delete lock.packages[`node_modules/${name}`];
  }
  for (const workspace of [
    'packages/core',
    'packages/narrative',
    'packages/gameplay',
    'packages/three',
    'tools/creator',
  ]) {
    delete lock.packages[workspace];
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumerRoot });
  log('Mahalle consumer development toolchain: locked npm ci passed');
}

async function installArchives(consumerRoot, archives) {
  const manifestPath = path.join(consumerRoot, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.dependencies ??= {};
  for (const { name, archive } of archives) {
    manifest.dependencies[name] =
      `file:${path.relative(consumerRoot, archive).replaceAll(path.sep, '/')}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumerRoot,
  });

  const modulesRoot = await realpath(path.join(consumerRoot, 'node_modules'));
  for (const { name } of archives) {
    const packagePath = path.join(modulesRoot, name);
    const stat = await lstat(packagePath);
    assert.ok(
      stat.isDirectory() && !stat.isSymbolicLink(),
      `${name} must be an installed directory`,
    );
    const packageRoot = await realpath(packagePath);
    assert.ok(
      packageRoot.startsWith(`${modulesRoot}${path.sep}`),
      `${name} must resolve from the independent consumer installation`,
    );
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    assert.deepEqual(
      Object.keys(packageJson.exports ?? {}),
      ['.'],
      `${name} exports only its root`,
    );
    assert.deepEqual(
      packageJson.dependencies ?? {},
      {},
      `${name} has no package runtime dependencies`,
    );
  }
  log(
    'Mahalle consumer framework packages: built archives installed offline without workspace links',
  );
}

function declarationProbe(name) {
  switch (name) {
    case 'waypoint-rpg-core':
      return `import { createGameRuntime, findPath, type WorldMap } from 'waypoint-rpg-core';\nvoid createGameRuntime; void findPath; const map: WorldMap | undefined = undefined; void map;\n`;
    case 'waypoint-rpg-narrative':
      return `import { compileNarrative, createNarrativeState, decodeNarrativeState, getDialogueView, getFact, getQuestStatus, transitionNarrative, validateNarrative } from 'waypoint-rpg-narrative';\nvoid [compileNarrative, createNarrativeState, decodeNarrativeState, getDialogueView, getFact, getQuestStatus, transitionNarrative, validateNarrative];\n`;
    case 'waypoint-rpg-gameplay':
      return `import { applyGameplayGrant, compileGameplay, createGameplayState, decodeGameplayState, encodeGameplayState, getCharacterLevel, getCharacterAttributes, getEffectiveCharacterAttributes, getInventorySlotCount, getUnlockedAbilityIds, transitionGameplay, validateGameplay } from 'waypoint-rpg-gameplay';\nvoid [applyGameplayGrant, compileGameplay, createGameplayState, decodeGameplayState, encodeGameplayState, getCharacterLevel, getCharacterAttributes, getEffectiveCharacterAttributes, getInventorySlotCount, getUnlockedAbilityIds, transitionGameplay, validateGameplay];\n`;
    case 'waypoint-rpg-three':
      return `import { animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord } from 'waypoint-rpg-three';\nvoid [animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord];\n`;
    default:
      throw new Error(`No public declaration probe for ${name}`);
  }
}

async function verifyIndependentArchives(consumerRoot, temporaryRoot, archives) {
  const compiler = path.join(consumerRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  for (const { name, archive } of archives) {
    const probeRoot = path.join(temporaryRoot, `probe-${name}`);
    await mkdir(probeRoot, { recursive: true });
    await writeFile(
      path.join(probeRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: `installed-${name}-consumer`,
          private: true,
          type: 'module',
          dependencies: {
            [name]: `file:${path.relative(probeRoot, archive).replaceAll(path.sep, '/')}`,
            ...(name === 'waypoint-rpg-three'
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
    await writeFile(path.join(probeRoot, 'consumer.ts'), declarationProbe(name));
    runNode(
      [
        '--input-type=module',
        '-e',
        `const api = await import('${name}'); if (!Object.keys(api).length) process.exit(1); try { await import('${name}/dist/index.js'); process.exit(2); } catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }`,
      ],
      { cwd: probeRoot },
    );
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
    log(`${name}: isolated installed ESM and NodeNext/Bundler declarations passed`);
  }
}

async function verifyPublicImports(consumerRoot) {
  const sourceRoot = path.join(consumerRoot, 'src');
  const files = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile() || !/\.[jt]sx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()['"]waypoint-rpg-(?:core|narrative|gameplay)\//,
      `Framework deep imports are not public APIs: ${path.relative(consumerRoot, file)}`,
    );
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()['"][^"']*(?:scene-demo|src\/framework|packages\/(?:core|narrative|gameplay)\/src)/,
      `The root game must not import repository-private implementation: ${path.relative(consumerRoot, file)}`,
    );
  }

  const manifest = JSON.parse(await readFile(path.join(consumerRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.workspaces, undefined, 'independent consumer must not declare workspaces');
  const sourceDirs = await readdir(consumerRoot);
  assert.equal(
    sourceDirs.includes('packages'),
    false,
    'framework package source is excluded from consumer',
  );
  assert.equal(
    sourceDirs.includes('tools'),
    false,
    'creator workspace source is excluded from consumer',
  );
}

async function installChromium(consumerRoot) {
  const mode = process.env['FRAMEWORK_INSTALL_CHROMIUM'];
  if (!mode) return;
  const args = ['exec', '--', 'playwright', 'install'];
  if (mode === '1') args.push('--with-deps');
  args.push('chromium');
  runNpm(args, { cwd: consumerRoot });
}

async function preserveDiagnostics(consumerRoot) {
  const output = process.env['FRAMEWORK_MAHALLE_DIAGNOSTICS_OUTPUT'];
  if (!output) return;
  const outputRoot = path.resolve(output);
  await mkdir(outputRoot, { recursive: true });
  for (const name of ['playwright-report', 'test-results']) {
    try {
      await lstat(path.join(consumerRoot, name));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    await cp(path.join(consumerRoot, name), path.join(outputRoot, name), {
      recursive: true,
      force: true,
    });
  }
  log(`Mahalle consumer diagnostics copied to ${outputRoot}`);
}

export async function checkFrameworkMahalleConsumer() {
  const temporaryRoot = await mkdtemp(path.join(await realpath(os.tmpdir()), 'waypoint-mahalle-'));
  const consumerRoot = path.join(temporaryRoot, 'consumer');
  const artifactRoot = path.join(temporaryRoot, 'artifacts');

  try {
    await mkdir(artifactRoot, { recursive: true });
    await copyApplication(consumerRoot);
    const archives = [];
    for (const frameworkPackage of frameworkPackages) {
      archives.push({
        ...frameworkPackage,
        archive: await packFrameworkPackage(artifactRoot, frameworkPackage),
      });
    }

    await removeWorkspaceLinks(consumerRoot);
    await installArchives(consumerRoot, archives);
    await verifyPublicImports(consumerRoot);

    runNode(
      [
        '--input-type=module',
        '-e',
        "import { createGameRuntime, findPath } from 'waypoint-rpg-core'; import { compileNarrative, validateNarrative } from 'waypoint-rpg-narrative'; import { compileGameplay, validateGameplay } from 'waypoint-rpg-gameplay'; import { animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord } from 'waypoint-rpg-three'; if (![createGameRuntime, findPath, compileNarrative, validateNarrative, compileGameplay, validateGameplay, animationClipId, createModelAssetLoader, resolveSemanticClip, validateModelAssetRecord].every((item) => typeof item === 'function')) process.exit(1);",
      ],
      { cwd: consumerRoot },
    );
    runNpm(['--ignore-scripts', 'run', 'typecheck'], { cwd: consumerRoot });
    runNpm(['--ignore-scripts', 'run', 'test'], { cwd: consumerRoot });
    runNpm(['--ignore-scripts', 'run', 'test:mahalle:migration'], { cwd: consumerRoot });
    // Root build includes content and asset validation, production Vite build,
    // bundle budgets, and deployment-path verification. Lifecycle hooks are
    // suppressed because package source workspaces are intentionally absent.
    runNpm(['--ignore-scripts', 'run', 'build'], { cwd: consumerRoot });
    await verifyIndependentArchives(consumerRoot, temporaryRoot, archives);
    await installChromium(consumerRoot);
    runNpm(
      [
        '--ignore-scripts',
        'run',
        'test:e2e',
        '--',
        'e2e/slice.spec.ts',
        '--project=landscape-mobile',
        '--grep=both avatars play identically',
      ],
      { cwd: consumerRoot },
    );
    log(
      'framework Mahalle consumer passed: independent root-game copy, four offline archives, public ESM/types, unit tests, content/assets, production/deploy budgets, and Chromium quest gameplay',
    );
  } catch (error) {
    try {
      await preserveDiagnostics(consumerRoot);
    } catch (diagnosticsError) {
      logError('Could not preserve Mahalle consumer diagnostics:', diagnosticsError);
    }
    throw error;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkFrameworkMahalleConsumer();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
