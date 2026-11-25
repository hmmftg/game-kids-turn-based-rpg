import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { build, preview } from 'vite';

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolutePath)));
    else files.push(absolutePath);
  }
  return files;
}

test('populated unapproved pilot staging stays out of the Garden production build', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'meshy-pilot-artifact-isolation-'));
  const stagingRoot = join(temporaryRoot, 'staging');
  const outputRoot = join(temporaryRoot, 'production-build');
  const gardenRoot = resolve('examples/garden-adventure');
  const privateMarker = Buffer.from('private-unapproved-meshy-pilot-marker');
  const modelPath = join(stagingRoot, 'models', 'pilot-unapproved.glb');
  const previousPilotDirectory = process.env['WAYPOINT_MESHY_PILOT_DIR'];

  try {
    await mkdir(join(stagingRoot, 'models'), { recursive: true });
    await mkdir(join(stagingRoot, 'metadata'), { recursive: true });
    await mkdir(join(stagingRoot, 'screenshots'), { recursive: true });
    await writeFile(modelPath, privateMarker);
    await writeFile(
      join(stagingRoot, 'asset-records.json'),
      JSON.stringify([
        {
          id: 'pilot-unapproved',
          runtimePath: 'models/pilot-unapproved.glb',
          outputSha256: createHash('sha256').update(privateMarker).digest('hex'),
          metrics: { outputBytes: privateMarker.byteLength },
          private: privateMarker.toString(),
        },
      ]),
    );
    await writeFile(join(stagingRoot, 'metadata', 'pilot-unapproved.json'), privateMarker);
    await writeFile(join(stagingRoot, 'screenshots', 'pilot-private.png'), privateMarker);
    process.env['WAYPOINT_MESHY_PILOT_DIR'] = stagingRoot;

    await build({
      root: gardenRoot,
      configFile: join(gardenRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir: outputRoot, emptyOutDir: true },
    });

    const server = await preview({
      root: gardenRoot,
      configFile: join(gardenRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir: outputRoot },
      preview: { port: 0 },
    });
    try {
      const { port } = server.httpServer.address();
      const result = await fetch(`http://127.0.0.1:${port}/__meshy/pilot/asset-records.json`);
      assert.notEqual(result.headers.get('x-waypoint-meshy-pilot'), 'enabled');
      assert.equal((await result.text()).includes(privateMarker.toString()), false);
    } finally {
      await new Promise((resolveClose) => server.httpServer.close(resolveClose));
    }
    const outputFiles = await listFiles(outputRoot);
    assert.ok(outputFiles.length > 0, 'The production build must emit files.');
    const emittedModels = outputFiles
      .filter((file) => /\.(?:glb|gltf)$/i.test(file))
      .map((file) => basename(file))
      .sort();
    assert.deepEqual(
      emittedModels,
      ['phase5-animated-guardian.glb', 'phase5-textured-static.glb'],
      'Only the two registered public Garden fixtures may ship; private pilot model binaries must stay out.',
    );
    assert.equal(
      outputFiles.some((file) => /asset-(?:records|catalog)\.json$/i.test(file)),
      false,
      'Private pilot manifests and catalogs must not be copied into the production output.',
    );
    assert.equal(
      outputFiles.some((file) => /pilot-(?:unapproved\.json|private\.png)$/i.test(file)),
      false,
      'Private pilot metadata and screenshots must not be copied into the production output.',
    );
    for (const file of outputFiles) {
      const emittedBytes = await readFile(file);
      assert.equal(
        emittedBytes.includes(privateMarker),
        false,
        `Private staging bytes leaked into ${file}.`,
      );
    }
  } finally {
    if (previousPilotDirectory === undefined) delete process.env['WAYPOINT_MESHY_PILOT_DIR'];
    else process.env['WAYPOINT_MESHY_PILOT_DIR'] = previousPilotDirectory;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
