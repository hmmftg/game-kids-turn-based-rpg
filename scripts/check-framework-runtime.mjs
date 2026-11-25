import assert from 'node:assert/strict';
import { error as logError, log } from 'node:console';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { runNpm, runNode } from './framework-consumer-support.mjs';

const fixtureRoot = fileURLToPath(new URL('../packages/core-consumer/', import.meta.url));
const narrativeRuntimeProbe = fileURLToPath(
  new URL('../packages/narrative/runtime-smoke.mjs', import.meta.url),
);
const gameplayRuntimeProbe = fileURLToPath(
  new URL('../packages/gameplay/runtime-smoke.mjs', import.meta.url),
);

export async function prepareRuntimeConsumer(
  coreTarballPath,
  projectRoot,
  narrativeTarballPath,
  gameplayTarballPath,
) {
  const resolvedCore = path.resolve(coreTarballPath);
  const resolvedNarrative = narrativeTarballPath ? path.resolve(narrativeTarballPath) : null;
  const resolvedGameplay = gameplayTarballPath ? path.resolve(gameplayTarballPath) : null;
  const root = path.resolve(projectRoot);
  const emptyCache = path.join(root, '.empty-cache');
  await mkdir(emptyCache, { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'isolated-framework-runtime-probe', private: true, type: 'module' }),
  );
  await copyFile(path.join(fixtureRoot, 'runtime-smoke.mjs'), path.join(root, 'runtime-smoke.mjs'));
  await copyFile(
    path.join(fixtureRoot, 'source-map-probe.mjs'),
    path.join(root, 'source-map-probe.mjs'),
  );
  const archives = [resolvedCore];
  if (resolvedNarrative) {
    await copyFile(narrativeRuntimeProbe, path.join(root, 'narrative-runtime-smoke.mjs'));
    archives.push(resolvedNarrative);
  }
  if (resolvedGameplay) {
    await copyFile(gameplayRuntimeProbe, path.join(root, 'gameplay-runtime-smoke.mjs'));
    archives.push(resolvedGameplay);
  }
  runNpm(
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--cache',
      emptyCache,
      ...archives,
    ],
    { cwd: root },
  );
}

export function probeRuntimeConsumer(projectRoot, expectedNodeVersion) {
  if (expectedNodeVersion)
    assert.equal(
      process.versions.node,
      expectedNodeVersion,
      `native runtime probe must run under Node ${expectedNodeVersion}`,
    );
  const root = path.resolve(projectRoot);
  const resolvedOutput = runNode(['--enable-source-maps', 'runtime-smoke.mjs'], { cwd: root });
  assert.match(resolvedOutput, /isolated native ESM consumer passed/);

  let sourceMapError;
  try {
    runNode(['--enable-source-maps', 'source-map-probe.mjs'], { cwd: root });
  } catch (error) {
    sourceMapError = error;
  }
  assert.ok(sourceMapError, 'the deliberate missing-anchor lookup must throw');
  assert.notEqual(sourceMapError.status, 0);
  const sourceMapTrace = String(sourceMapError.stderr ?? '').replaceAll('\\', '/');
  assert.match(sourceMapTrace, /Unknown anchor: anchor-missing/);
  assert.match(
    sourceMapTrace,
    /node_modules\/waypoint-rpg-core\/src\/graph\.ts:\d+:\d+/,
    'native source maps must identify the original graph.ts source',
  );

  if (!existsSync(path.join(root, 'narrative-runtime-smoke.mjs'))) {
    log('framework runtime: native core ESM and source maps passed');
    return;
  }
  const narrativeOutput = runNode(['narrative-runtime-smoke.mjs'], { cwd: root });
  assert.match(
    narrativeOutput,
    /narrative package native ESM dialogue, repeatable quest, and snapshot runtime passed/,
  );
  if (!existsSync(path.join(root, 'gameplay-runtime-smoke.mjs'))) {
    log('framework runtime: native core+narrative ESM and core source maps passed');
    return;
  }
  const gameplayOutput = runNode(['gameplay-runtime-smoke.mjs'], { cwd: root });
  assert.match(
    gameplayOutput,
    /gameplay package native ESM progression, lightweight encounter, and snapshot runtime passed/,
  );
  log('framework runtime: native core+narrative+gameplay ESM and core source maps passed');
}

export async function checkRuntimeFromTarball(tarballPath) {
  const resolvedTarball = path.resolve(tarballPath);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'waypoint-rpg-runtime-consumer-'));
  const projectRoot = path.join(temporaryRoot, 'project');
  try {
    await readFile(resolvedTarball);
    await mkdir(projectRoot);
    await prepareRuntimeConsumer(resolvedTarball, projectRoot);
    probeRuntimeConsumer(projectRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const [mode, first, second, third, fourth] = process.argv.slice(2);
  if (mode === '--prepare') {
    if (!first || !second || !third || !fourth)
      throw new Error(
        'Usage: --prepare <core.tgz> <narrative.tgz> <gameplay.tgz> <consumer-directory>',
      );
    await Promise.all([first, second, third].map((archive) => readFile(path.resolve(archive))));
    await prepareRuntimeConsumer(first, fourth, second, third);
    log('framework runtime: offline Node 22.22.2 consumer prepared');
    return;
  }
  if (mode === '--probe') {
    if (!first) throw new Error('Usage: --probe <prepared-consumer-directory>');
    const expectedNodeVersion = process.env.FRAMEWORK_EXPECT_RUNTIME_NODE;
    probeRuntimeConsumer(first, expectedNodeVersion);
    return;
  }
  if (!mode) throw new Error('Provide a built waypoint-rpg-core .tgz path.');
  await readFile(path.resolve(mode));
  await checkRuntimeFromTarball(mode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
