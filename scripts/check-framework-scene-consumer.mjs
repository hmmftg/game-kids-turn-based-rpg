import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { runNpm } from './framework-consumer-support.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const exampleRoot = path.join(repoRoot, 'examples', 'scene-demo');

async function getTarball(temporaryRoot, { workspace, name, outputVariable }) {
  const providedTarball = process.env[outputVariable];
  if (providedTarball) {
    const resolved = path.resolve(providedTarball);
    await readFile(resolved);
    return resolved;
  }

  const artifactRoot = path.join(temporaryRoot, 'artifact');
  await mkdir(artifactRoot, { recursive: true });
  const packed = runNpm(
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
  const [packResult] = JSON.parse(packed);
  assert.ok(packResult, `npm pack must produce exactly one ${name} package`);
  assert.equal(packResult.name, name);
  assert.equal(JSON.parse(packed).length, 1);
  return path.join(artifactRoot, packResult.filename);
}

export async function checkFrameworkSceneConsumer() {
  const temporaryDirectory = await realpath(os.tmpdir());
  const temporaryRoot = await mkdtemp(
    path.join(temporaryDirectory, 'waypoint-rpg-scene-consumer-'),
  );
  const consumerRoot = path.join(temporaryRoot, 'consumer');

  try {
    await cp(exampleRoot, consumerRoot, {
      recursive: true,
      filter: (source) =>
        !source.split(path.sep).some((part) => ['node_modules', 'dist'].includes(part)),
    });

    const manifestPath = path.join(consumerRoot, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.dependencies = { ...manifest.dependencies };
    const packageNames = [
      'waypoint-rpg-core',
      'waypoint-rpg-narrative',
      'waypoint-rpg-gameplay',
      'waypoint-rpg-three',
    ];
    for (const packageName of packageNames) delete manifest.dependencies[packageName];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumerRoot });
    log('scene consumer development tools: locked npm ci passed');

    const tarballs = [
      {
        name: 'waypoint-rpg-core',
        workspace: 'packages/core',
        outputVariable: 'FRAMEWORK_TARBALL_OUTPUT',
      },
      {
        name: 'waypoint-rpg-narrative',
        workspace: 'packages/narrative',
        outputVariable: 'NARRATIVE_TARBALL_OUTPUT',
      },
      {
        name: 'waypoint-rpg-gameplay',
        workspace: 'packages/gameplay',
        outputVariable: 'GAMEPLAY_TARBALL_OUTPUT',
      },
      {
        name: 'waypoint-rpg-three',
        workspace: 'packages/three',
        outputVariable: 'THREE_TARBALL_OUTPUT',
      },
    ];
    for (const packageToInstall of tarballs) {
      packageToInstall.tarball = await getTarball(temporaryRoot, packageToInstall);
    }
    for (const packageToInstall of tarballs) {
      const relativeTarballPath = path
        .relative(consumerRoot, packageToInstall.tarball)
        .replaceAll(path.sep, '/');
      manifest.dependencies[packageToInstall.name] = `file:${relativeTarballPath}`;
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: consumerRoot,
    });
    const modulesRoot = await realpath(path.join(consumerRoot, 'node_modules'));
    for (const packageToInstall of tarballs) {
      const resolved = runNpm(['ls', '--parseable', '--depth=0', packageToInstall.name], {
        cwd: consumerRoot,
      });
      const resolvedEntries = await Promise.all(
        resolved
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((entry) => realpath(path.resolve(entry))),
      );
      const packageRoot = await realpath(path.join(modulesRoot, packageToInstall.name));
      const packageRelativePath = path.relative(modulesRoot, packageRoot);
      assert.ok(
        packageRelativePath &&
          !packageRelativePath.startsWith('..') &&
          !path.isAbsolute(packageRelativePath),
        `the installed ${packageToInstall.name} package must be inside the independent consumer node_modules`,
      );
      assert.ok(
        resolvedEntries.includes(packageRoot),
        `npm must resolve ${packageToInstall.name} from the independent consumer installation`,
      );
    }

    const chromiumInstallArgs = ['exec', '--', 'playwright', 'install'];
    if (process.env.FRAMEWORK_INSTALL_CHROMIUM === '1') chromiumInstallArgs.push('--with-deps');
    chromiumInstallArgs.push('chromium');
    if (process.env.FRAMEWORK_INSTALL_CHROMIUM) {
      runNpm(chromiumInstallArgs, { cwd: consumerRoot });
    }

    runNpm(['run', 'typecheck'], { cwd: consumerRoot });
    runNpm(['run', 'test'], { cwd: consumerRoot });
    runNpm(['run', 'build'], { cwd: consumerRoot });
    runNpm(['run', 'test:e2e'], { cwd: consumerRoot });
    log(
      'framework scene consumer: offline core+narrative+gameplay+three tarball install, typecheck, unit tests, Vite build, and Chromium narrative/lifecycle/model smoke passed',
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await checkFrameworkSceneConsumer();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
