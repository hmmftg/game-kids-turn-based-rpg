import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Accessor, Document, NodeIO } from '@gltf-transform/core';
import { importModel } from './import-model.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const fixtureDirectory = join(repositoryRoot, 'examples/scene-demo/fixtures/model-source');
const creatorCli = join(repositoryRoot, 'tools/creator/src/cli.mjs');
const fixture = (name) => join(fixtureDirectory, name);

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-model-import-'));
  try {
    await run(directory);
  } finally {
    // Windows can report ENOTEMPTY while a just-written fixture is still
    // being observed by the filesystem. Retry the recursive cleanup rather
    // than making the importer suite intermittently fail after valid output.
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function destinations(directory) {
  return {
    outputDirectory: join(directory, 'models'),
    manifestPath: join(directory, 'asset-records.json'),
  };
}

async function writeMetadata(directory, name, value) {
  const path = join(directory, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

async function writeNonIndexedTriangleGlb(path, triangleCount) {
  const gltf = new Document();
  const buffer = gltf.createBuffer();
  const positions = new Float32Array(triangleCount * 9);
  for (let index = 0; index < triangleCount; index += 1) {
    positions.set([-1, 0, 0, 1, 0, 0, 0, 2, 0], index * 9);
  }
  const accessor = gltf
    .createAccessor('positions')
    .setType(Accessor.Type.VEC3)
    .setArray(positions)
    .setBuffer(buffer);
  const primitive = gltf.createPrimitive().setAttribute('POSITION', accessor);
  const mesh = gltf.createMesh('high-poly').addPrimitive(primitive);
  gltf.createScene().addChild(gltf.createNode().setMesh(mesh));
  const glb = await new NodeIO().writeBinary(gltf);
  await writeFile(path, glb);
}

function addValidJsonWhitespace(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const jsonText = bytes.toString('utf8', 20, 20 + jsonLength).replace(/ +$/u, '');
  const changedJson = Buffer.from(jsonText.replace('{', '{\r'), 'utf8');
  const paddedLength = Math.ceil(changedJson.byteLength / 4) * 4;
  const paddedJson = Buffer.concat([
    changedJson,
    Buffer.alloc(paddedLength - changedJson.byteLength, 0x20),
  ]);
  const jsonHeader = Buffer.from(bytes.subarray(12, 20));
  jsonHeader.writeUInt32LE(paddedLength, 0);
  const updated = Buffer.concat([
    bytes.subarray(0, 12),
    jsonHeader,
    paddedJson,
    bytes.subarray(20 + jsonLength),
  ]);
  updated.writeUInt32LE(updated.byteLength, 8);
  return updated;
}

test('imports a self-contained textured static GLB and records verifiable provenance', async () => {
  await withTempDirectory(async (directory) => {
    const result = await importModel({
      sourcePath: fixture('static-textured.glb'),
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(directory),
    });
    assert.equal(result.record.schemaVersion, 1);
    assert.equal(result.record.metrics.textureCount, 1);
    assert.equal(result.record.materialNames.length, 1);
    assert.equal(result.record.metrics.jointCount, 0);
    assert.equal(result.record.runtimeFormat, 'glb');
    assert.equal(result.record.runtimePath, 'models/phase5-textured-static.glb');
    assert.equal(
      await readFile(result.outputPath).then((bytes) => bytes.length),
      result.record.metrics.outputBytes,
    );
  });
});

test('both asset CLIs support byte preservation and a trusted budget policy', async () => {
  await withTempDirectory(async (directory) => {
    const source = fixture('static-textured.glb');
    const metadata = fixture('static-textured.asset.json');
    const policy = await writeMetadata(directory, 'budget.json', { maxTriangles: 20 });
    for (const [script, command] of [
      [creatorCli, ['asset', 'import']],
      [join(repositoryRoot, 'scripts/import-model.mjs'), []],
    ]) {
      const outputDirectory = join(directory, command.length ? 'creator' : 'legacy');
      const result = spawnSync(
        process.execPath,
        [
          script,
          ...command,
          '--source',
          source,
          '--metadata',
          metadata,
          '--output-directory',
          outputDirectory,
          '--manifest',
          join(outputDirectory, 'manifest.json'),
          '--preserve-glb-bytes',
          '--budget-policy',
          policy,
        ],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
      const files = JSON.parse(await readFile(join(outputDirectory, 'manifest.json'), 'utf8'));
      assert.deepEqual(
        await readFile(join(outputDirectory, files[0].runtimePath.split('/').at(-1))),
        await readFile(source),
      );
    }
  });
});

test('preserves self-contained GLB bytes and hashes when byte preservation is requested', async () => {
  await withTempDirectory(async (directory) => {
    const sourcePath = join(directory, 'byte-preservation.glb');
    const sourceBytes = addValidJsonWhitespace(await readFile(fixture('static-textured.glb')));
    await writeFile(sourcePath, sourceBytes);
    const result = await importModel({
      sourcePath,
      metadataPath: fixture('static-textured.asset.json'),
      preserveGlbBytes: true,
      ...destinations(directory),
    });
    const outputBytes = await readFile(result.outputPath);
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

    assert.deepEqual(outputBytes, sourceBytes);
    assert.equal(result.record.sourceSha256, hash(sourceBytes));
    assert.equal(result.record.outputSha256, hash(sourceBytes));
    assert.equal(result.record.metrics.sourceBytes, sourceBytes.byteLength);
  });
});

test('keeps the default triangle limit and accepts a high-poly GLB only under the explicit pilot budget', async () => {
  await withTempDirectory(async (directory) => {
    const sourcePath = join(directory, 'high-poly.glb');
    const triangleCount = 60_001;
    await writeNonIndexedTriangleGlb(sourcePath, triangleCount);
    const common = {
      sourcePath,
      metadataPath: fixture('static-textured.asset.json'),
      preserveGlbBytes: true,
      ...destinations(join(directory, 'build')),
    };

    await assert.rejects(importModel(common), /60001 triangles exceed the limit 60000/);
    const result = await importModel({ ...common, budget: { maxTriangles: 400_000 } });

    assert.equal(result.record.metrics.triangles, triangleCount);
    assert.deepEqual(await readFile(result.outputPath), await readFile(sourcePath));
    assert.equal(result.record.sourceSha256, result.record.outputSha256);
  });
});

test('records stable animation indices for unnamed and duplicate source clip names without rewriting GLB', async () => {
  await withTempDirectory(async (directory) => {
    const sourcePath = join(directory, 'duplicate-animation-names.glb');
    const sourceDocument = await new NodeIO().read(fixture('rigged-animated.glb'));
    const animations = sourceDocument.getRoot().listAnimations();
    animations[0]?.setName('shared');
    animations[1]?.setName('shared');
    animations[2]?.setName('');
    animations[3]?.setName('combat');
    const sourceBytes = await new NodeIO().writeBinary(sourceDocument);
    await writeFile(sourcePath, sourceBytes);
    const metadata = JSON.parse(await readFile(fixture('rigged-animated.asset.json'), 'utf8'));
    metadata.clips = {
      idle: 'clip-1',
      move: 'clip-2',
      interact: 'clip-3',
      combat: 'combat',
    };
    const metadataPath = await writeMetadata(directory, 'duplicate-clips.asset.json', metadata);
    const result = await importModel({
      sourcePath,
      metadataPath,
      preserveGlbBytes: true,
      ...destinations(directory),
    });

    assert.deepEqual(await readFile(result.outputPath), Buffer.from(sourceBytes));
    assert.deepEqual(
      result.record.clipInventory.map(({ id, animationIndex, name, sourceName }) => ({
        id,
        animationIndex,
        name,
        sourceName,
      })),
      [
        { id: 'clip-1', animationIndex: 0, name: 'shared', sourceName: 'shared' },
        { id: 'clip-2', animationIndex: 1, name: 'shared', sourceName: 'shared' },
        { id: 'clip-3', animationIndex: 2, name: 'clip-3', sourceName: '' },
        { id: 'clip-4', animationIndex: 3, name: 'combat', sourceName: 'combat' },
      ],
    );
  });
});

test('validates partial importer budgets and never lets them exceed hard resource limits', async () => {
  await withTempDirectory(async (directory) => {
    const common = {
      sourcePath: fixture('static-textured.glb'),
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(directory),
    };
    await assert.rejects(
      importModel({ ...common, budget: { maxTriangles: 400_001 } }),
      /maxTriangles cannot exceed the local pilot limit 400000/,
    );
    await assert.rejects(
      importModel({ ...common, budget: { maxTriangles: '400000' } }),
      /maxTriangles must be a positive safe integer/,
    );
    await assert.rejects(
      importModel({ ...common, budget: { maxFileBytes: 100 * 1024 * 1024 } }),
      /maxFileBytes cannot exceed its hard limit 12582912/,
    );
  });
});

test('preserves skin weights and named animation clips in the release GLB', async () => {
  await withTempDirectory(async (directory) => {
    const result = await importModel({
      sourcePath: fixture('rigged-animated.glb'),
      metadataPath: fixture('rigged-animated.asset.json'),
      ...destinations(directory),
    });
    assert.equal(result.record.schemaVersion, 1);
    assert.equal(result.record.metrics.jointCount, 2);
    assert.equal(result.record.metrics.skinCount, 1);
    assert.deepEqual(
      result.record.clipInventory.map((clip) => clip.name),
      ['idle', 'move', 'interact', 'combat'],
    );
    const output = await new NodeIO().read(result.outputPath);
    assert.equal(output.getRoot().listSkins()[0]?.listJoints().length, 2);
    assert.equal(output.getRoot().listAnimations().length, 4);
    assert.ok(output.getRoot().listMeshes()[0]?.listPrimitives()[0]?.getAttribute('WEIGHTS_0'));
  });
});

test('assigns a stable runtime name to an unnamed external rigged-model clip', async () => {
  await withTempDirectory(async (directory) => {
    const result = await importModel({
      sourcePath: join(fixtureDirectory, 'khronos/RiggedFigure.glb'),
      metadataPath: join(fixtureDirectory, 'khronos/rigged-figure.asset.json'),
      ...destinations(directory),
    });
    const output = await new NodeIO().read(result.outputPath);
    assert.deepEqual(
      result.record.clipInventory.map((clip) => clip.name),
      ['clip-1'],
    );
    assert.equal(result.record.clips.idle, 'clip-1');
    assert.equal(output.getRoot().listAnimations()[0]?.getName(), 'clip-1');
    assert.equal(output.getRoot().listSkins().length, 1);
    assert.equal(output.getRoot().listAnimations()[0]?.listChannels().length, 57);
  });
});

test('repeated imports produce the same release hash and canonical manifest', async () => {
  await withTempDirectory(async (directory) => {
    const options = {
      sourcePath: fixture('rigged-animated.glb'),
      metadataPath: fixture('rigged-animated.asset.json'),
      ...destinations(directory),
    };
    const first = await importModel(options);
    const firstManifest = await readFile(first.manifestPath, 'utf8');
    const second = await importModel(options);
    assert.equal(second.record.outputSha256, first.record.outputSha256);
    assert.equal(await readFile(second.manifestPath, 'utf8'), firstManifest);
  });
});

test('converts a glTF source with local dependencies to a self-contained GLB', async () => {
  await withTempDirectory(async (directory) => {
    const io = new NodeIO();
    const source = await io.read(fixture('static-textured.glb'));
    const gltfPath = join(directory, 'local-source.gltf');
    await io.write(gltfPath, source);
    const result = await importModel({
      sourcePath: gltfPath,
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(join(directory, 'build')),
    });
    assert.equal(result.record.sourceFormat, 'gltf');
    assert.equal(result.record.runtimeFormat, 'glb');
    assert.equal(result.record.metrics.textureCount, 1);
    const output = await new NodeIO().read(result.outputPath);
    assert.equal(output.getRoot().listTextures().length, 1);
    assert.equal(output.getRoot().listBuffers().length, 1);
  });
});

test('parses exactly the local glTF dependency bytes that were validated', async () => {
  await withTempDirectory(async (directory) => {
    const sourcePath = join(directory, 'local-source.gltf');
    const sourceDocument = await new NodeIO().read(fixture('static-textured.glb'));
    await new NodeIO().write(sourcePath, sourceDocument);
    const sourceJson = JSON.parse(await readFile(sourcePath, 'utf8'));
    const bufferPath = join(directory, sourceJson.buffers[0].uri);
    const expected = await importModel({
      sourcePath,
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(join(directory, 'expected')),
    });

    const changedBytes = Buffer.from(await readFile(bufferPath));
    changedBytes.writeFloatLE(42, 0);
    const originalRead = NodeIO.prototype.read;
    NodeIO.prototype.read = function (uri) {
      if (uri !== sourcePath) return originalRead.call(this, uri);
      return writeFile(bufferPath, changedBytes).then(() => originalRead.call(this, uri));
    };

    let actual;
    try {
      actual = await importModel({
        sourcePath,
        metadataPath: fixture('static-textured.asset.json'),
        ...destinations(join(directory, 'actual')),
      });
    } finally {
      NodeIO.prototype.read = originalRead;
    }

    assert.deepEqual(actual.record.bounds, expected.record.bounds);
  });
});

test('rejects unsafe resource paths, remote imports, unsupported extensions, and bad rights', async () => {
  await withTempDirectory(async (directory) => {
    const output = destinations(directory);
    const traversal = join(directory, 'traversal.gltf');
    await writeFile(
      traversal,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: '../outside.bin', byteLength: 4 }],
      }),
    );
    await assert.rejects(
      importModel({
        sourcePath: traversal,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /escapes the source folder/,
    );

    const remote = join(directory, 'remote.gltf');
    await writeFile(
      remote,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'https://example.invalid/model.bin', byteLength: 4 }],
      }),
    );
    await assert.rejects(
      importModel({
        sourcePath: remote,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /external, absolute, or backslash/,
    );

    const missingResource = join(directory, 'missing.gltf');
    await writeFile(
      missingResource,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'missing.bin', byteLength: 4 }],
      }),
    );
    await assert.rejects(
      importModel({
        sourcePath: missingResource,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /referenced local resource does not exist/,
    );

    const extension = join(directory, 'extension.gltf');
    await writeFile(
      extension,
      JSON.stringify({ asset: { version: '2.0' }, extensionsRequired: ['EXT_unreviewed_runtime'] }),
    );
    await assert.rejects(
      importModel({
        sourcePath: extension,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /unsupported glTF extension/,
    );

    const metadata = JSON.parse(await readFile(fixture('static-textured.asset.json'), 'utf8'));
    metadata.rights.licenseId = 'unknown';
    const metadataPath = await writeMetadata(directory, 'unlicensed.json', metadata);
    await assert.rejects(
      importModel({ sourcePath: fixture('static-textured.glb'), metadataPath, ...output }),
      /explicit, reviewed license ID/,
    );
  });
});

test('rejects malformed GLB containers and files beyond the configured byte budget', async () => {
  await withTempDirectory(async (directory) => {
    const malformed = join(directory, 'bad.glb');
    await writeFile(malformed, Buffer.from('not a glb'));
    const output = destinations(directory);
    await assert.rejects(
      importModel({
        sourcePath: malformed,
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
      }),
      /invalid GLB header/,
    );
    await assert.rejects(
      importModel({
        sourcePath: fixture('static-textured.glb'),
        metadataPath: fixture('static-textured.asset.json'),
        ...output,
        budget: { maxFileBytes: 100 },
      }),
      /source is .* limit is 100/,
    );
  });
});

test('rejects over-budget geometry and textures before creating release records', async () => {
  await withTempDirectory(async (directory) => {
    const common = {
      sourcePath: fixture('static-textured.glb'),
      metadataPath: fixture('static-textured.asset.json'),
      ...destinations(directory),
    };
    await assert.rejects(
      importModel({ ...common, budget: { maxTriangles: 11 } }),
      /12 triangles exceed the limit 11/,
    );
    await assert.rejects(
      importModel({ ...common, budget: { maxTextureDimension: 4 } }),
      /texture .* exceeds 4px/,
    );
    await assert.rejects(
      readFile(common.manifestPath),
      /ENOENT/,
      'invalid model imports must not write a release manifest',
    );
  });
});

test('rejects a resource whose symlink or junction resolves outside the source folder', async () => {
  await withTempDirectory(async (directory) => {
    const sourceDirectory = join(directory, 'source');
    const outsideDirectory = join(directory, 'outside');
    await mkdir(sourceDirectory);
    await mkdir(outsideDirectory);
    await writeFile(join(outsideDirectory, 'mesh.bin'), Buffer.alloc(4));
    await symlink(outsideDirectory, join(sourceDirectory, 'linked'), 'junction');
    const sourcePath = join(sourceDirectory, 'model.gltf');
    await writeFile(
      sourcePath,
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'linked/mesh.bin', byteLength: 4 }],
      }),
    );

    await assert.rejects(
      importModel({
        sourcePath,
        metadataPath: fixture('static-textured.asset.json'),
        ...destinations(join(directory, 'build')),
      }),
      /resource symlink escapes the source folder/,
    );
  });
});

test('rejects unsupported source file extensions before parsing', async () => {
  await withTempDirectory(async (directory) => {
    const sourcePath = join(directory, 'model.obj');
    await writeFile(sourcePath, 'v 0 0 0\n');

    await assert.rejects(
      importModel({
        sourcePath,
        metadataPath: fixture('static-textured.asset.json'),
        ...destinations(join(directory, 'build')),
      }),
      /source must be .glb or .gltf/,
    );
  });
});

test('keeps a duplicate asset ID unchanged unless replacement is explicit', async () => {
  await withTempDirectory(async (directory) => {
    const output = destinations(join(directory, 'build'));
    const first = await importModel({
      sourcePath: fixture('static-textured.glb'),
      metadataPath: fixture('static-textured.asset.json'),
      ...output,
    });
    const metadata = JSON.parse(await readFile(fixture('static-textured.asset.json'), 'utf8'));
    const metadataPath = await writeMetadata(directory, 'same-id.json', metadata);

    await assert.rejects(
      importModel({
        sourcePath: fixture('rigged-animated.glb'),
        metadataPath,
        ...output,
      }),
      /existing asset differs; pass --replace/,
    );
    assert.equal(
      await readFile(first.outputPath).then((bytes) => bytes.length),
      first.record.metrics.outputBytes,
    );

    const replaced = await importModel({
      sourcePath: fixture('rigged-animated.glb'),
      metadataPath,
      ...output,
      replace: true,
    });
    assert.notEqual(replaced.record.outputSha256, first.record.outputSha256);
    assert.equal(
      JSON.parse(await readFile(output.manifestPath, 'utf8'))[0].outputSha256,
      replaced.record.outputSha256,
    );
  });
});

test('does not leave a release model when its import manifest cannot be committed', async () => {
  await withTempDirectory(async (directory) => {
    const outputDirectory = join(directory, 'models');
    const blockedParent = join(directory, 'manifest-parent-is-a-file');
    await writeFile(blockedParent, 'not a directory');

    await assert.rejects(
      importModel({
        sourcePath: fixture('static-textured.glb'),
        metadataPath: fixture('static-textured.asset.json'),
        outputDirectory,
        manifestPath: join(blockedParent, 'asset-records.json'),
      }),
      /ENOTDIR|EEXIST/,
    );
    await assert.rejects(readFile(join(outputDirectory, 'phase5-textured-static.glb')), {
      code: 'ENOENT',
    });
  });
});

test('creator CLI imports local assets for technical preview without release approval', async () => {
  await withTempDirectory(async (directory) => {
    const metadata = JSON.parse(await readFile(fixture('static-textured.asset.json'), 'utf8'));
    metadata.rights.approved = false;
    const metadataPath = await writeMetadata(directory, 'unapproved.json', metadata);
    const outputDirectory = join(directory, 'public', 'models');
    const manifestPath = join(directory, 'assets', 'imports.json');
    const result = spawnSync(
      process.execPath,
      [
        creatorCli,
        'asset',
        'import',
        '--source',
        fixture('static-textured.glb'),
        '--metadata',
        metadataPath,
        '--output-directory',
        outputDirectory,
        '--manifest',
        manifestPath,
      ],
      { cwd: directory, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Imported phase5-textured-static/);
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8'))[0].rights.approved, false);
  });
});

test('rejects invalid skin joint indices before producing a release model', async () => {
  await withTempDirectory(async (directory) => {
    const io = new NodeIO();
    const document = await io.read(fixture('rigged-animated.glb'));
    const joints = document
      .getRoot()
      .listMeshes()[0]
      ?.listPrimitives()[0]
      ?.getAttribute('JOINTS_0')
      ?.getArray();
    assert.ok(joints);
    joints[0] = 255;
    const invalidSource = join(directory, 'invalid-skin.glb');
    await writeFile(invalidSource, await io.writeBinary(document));
    await assert.rejects(
      importModel({
        sourcePath: invalidSource,
        metadataPath: fixture('rigged-animated.asset.json'),
        ...destinations(join(directory, 'build')),
      }),
      /joint index is out of range/,
    );
  });
});
