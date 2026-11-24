import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  createGameProject,
  createGameProjectManifest,
  inspectGameProject,
  validateGameProject,
  validateGameProjectManifest,
} from '../src/game-project.mjs';

const core = 'waypoint-rpg-core';

function frameworkTarball(name, version = '0.1.0') {
  const entry = Buffer.from(JSON.stringify({ name, version, type: 'module' }));
  const header = Buffer.alloc(512);
  header.write('package/package.json', 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${entry.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('0000000\0', 136, 8, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  const padding = Buffer.alloc((512 - (entry.length % 512)) % 512);
  return gzipSync(Buffer.concat([header, entry, padding, Buffer.alloc(1024)]));
}

function validManifest() {
  return createGameProjectManifest({ id: 'story-garden', displayName: 'Story Garden' });
}

test('manifest schema requires core and keeps narrative, gameplay, and timelines optional', () => {
  const manifest = validManifest();
  assert.deepEqual(validateGameProjectManifest(manifest), { ok: true, diagnostics: [] });

  const narrativeOnly = {
    ...manifest,
    frameworkPackages: [core, 'waypoint-rpg-narrative'],
    content: { ...manifest.content, narrativeDefinitionPath: 'src/content/story.json' },
  };
  assert.equal(validateGameProjectManifest(narrativeOnly).ok, true);

  const gameplayOnly = {
    ...manifest,
    frameworkPackages: [core, 'waypoint-rpg-gameplay'],
    content: { ...manifest.content, gameplayDefinitionPath: 'src/content/combat.json' },
  };
  assert.equal(validateGameProjectManifest(gameplayOnly).ok, true);
});

test('manifest validation rejects path traversal, duplicate IDs, unsupported packages, and deferred timelines', () => {
  const manifest = validManifest();
  const invalid = {
    ...manifest,
    frameworkPackages: [core, 'waypoint-rpg-narrative', 'waypoint-rpg-narrative', '../gameplay'],
    scenes: [
      ...manifest.scenes,
      { ...manifest.scenes[0], worldDefinitionPath: '../outside/world.ts' },
    ],
    content: { ...manifest.content, timelineDefinitionPaths: ['src/cinematics/opening.json'] },
  };
  const codes = validateGameProjectManifest(invalid).diagnostics.map((issue) => issue.code);
  assert.ok(codes.includes('duplicate-package'));
  assert.ok(codes.includes('unsupported-package'));
  assert.ok(codes.includes('duplicate-id'));
  assert.ok(codes.includes('invalid-path'));
  assert.ok(codes.includes('timeline-runtime-deferred'));
});

test('manifest validation safely rejects non-JSON data without evaluating accessors', () => {
  let getterCalled = false;
  const manifest = validManifest();
  Object.defineProperty(manifest, 'unsafe', {
    enumerable: true,
    get() {
      getterCalled = true;
      return 'no';
    },
  });
  const report = validateGameProjectManifest(manifest);
  assert.equal(report.ok, false);
  assert.equal(getterCalled, false);
  assert.ok(report.diagnostics.some((issue) => issue.code === 'non-data-property'));
});

test('scaffolds a portable one-scene game with local package archives and no overwrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'creator-game-project-'));
  const archive = join(directory, 'core.tgz');
  const project = join(directory, 'games', 'فارسی game');
  await writeFile(archive, frameworkTarball(core));
  try {
    const created = await createGameProject({
      directory: project,
      id: 'garden-story',
      displayName: 'باغ <سپیده>',
      frameworkPackages: [core],
      supportedLocales: ['fa-IR', 'en'],
      defaultLocale: 'fa-IR',
      frameworkArchives: { [core]: archive },
    });
    assert.equal(created.manifest.start.mapId, 'map-main');
    assert.equal(created.manifest.start.anchorId, 'anchor-spawn');
    assert.equal((await validateGameProject(project)).ok, true);
    assert.deepEqual(
      await readFile(join(project, 'vendor', `${core}.tgz`)),
      frameworkTarball(core),
    );
    const packageLock = JSON.parse(await readFile(join(project, 'package-lock.json'), 'utf8'));
    assert.equal(packageLock.packages[`node_modules/${core}`].resolved, `file:vendor/${core}.tgz`);
    const html = await readFile(join(project, 'index.html'), 'utf8');
    assert.match(html, /lang="fa-IR"/u);
    assert.match(html, /&lt;سپیده&gt;/u);
    assert.match(
      await readFile(join(project, 'src/vite-env.d.ts'), 'utf8'),
      /reference types="vite\/client"/u,
    );
    const packageJson = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
    assert.equal(packageJson.dependencies[core], `file:vendor/${core}.tgz`);
    assert.equal(packageJson.dependencies['waypoint-rpg-gameplay'], undefined);
    assert.equal(packageJson.scripts.test, 'vitest run src');
    const summary = await inspectGameProject(project);
    assert.equal(summary.summary.id, 'garden-story');
    assert.deepEqual(summary.summary.frameworkPackages, [core]);
    await assert.rejects(
      createGameProject({
        directory: project,
        id: 'garden-story',
        displayName: 'Overwrite',
        frameworkArchives: { [core]: archive },
      }),
      /Refusing to overwrite/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('game project disk validation reports missing referenced files and unknown catalog assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'creator-game-invalid-'));
  const archive = join(directory, 'core.tgz');
  const project = join(directory, 'project');
  await writeFile(archive, frameworkTarball(core));
  try {
    await createGameProject({
      directory: project,
      id: 'asset-demo',
      displayName: 'Asset demo',
      frameworkArchives: { [core]: archive },
    });
    const manifestPath = join(project, 'game.project.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.assets.references.push({
      assetId: 'missing-asset',
      source: 'shared',
      runtimePath: 'public/models/missing.glb',
    });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = await validateGameProject(project);
    const codes = result.diagnostics.map((issue) => issue.code);
    assert.ok(codes.includes('project-file-invalid'));
    assert.ok(codes.includes('unknown-catalog-asset'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('create refuses to copy a package set without each selected local tarball', async () => {
  await assert.rejects(
    createGameProject({
      directory: join(tmpdir(), 'must-not-create'),
      id: 'missing-tarball',
      displayName: 'Missing',
    }),
    /local waypoint-rpg-core tarball/u,
  );
});
