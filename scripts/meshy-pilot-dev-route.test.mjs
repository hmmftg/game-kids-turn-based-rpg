import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createMeshyPilotRoutePlugin, isConfinedPath } from './meshy-pilot-dev-route.mjs';

const stageDirectory = await mkdtemp(join(tmpdir(), 'meshy-pilot-route-'));
const outsideDirectory = await mkdtemp(join(tmpdir(), 'meshy-pilot-outside-'));
const stageModels = join(stageDirectory, 'models');
const validModel = Buffer.from('private model bytes for route');
const validRecord = {
  id: 'pilot-model',
  runtimePath: 'models/pilot-model.glb',
  outputSha256: createHash('sha256').update(validModel).digest('hex'),
  metrics: { outputBytes: validModel.byteLength },
};

let server;
let origin;

before(async () => {
  await mkdir(stageModels);
  await writeFile(join(stageModels, 'pilot-model.glb'), validModel);
  await writeFile(join(stageDirectory, 'asset-records.json'), JSON.stringify([validRecord]));
  await writeFile(join(stageDirectory, 'private-catalog.json'), 'private catalog data');

  server = await createServer({
    configFile: false,
    plugins: [createMeshyPilotRoutePlugin(stageDirectory)],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await server?.close();
  await rm(stageDirectory, { recursive: true, force: true });
  await rm(outsideDirectory, { recursive: true, force: true });
});

test('configured loopback route serves its manifest and only registered model bytes', async () => {
  const manifest = await fetch(`${origin}/__meshy/pilot/asset-records.json`);
  assert.equal(manifest.status, 200, await manifest.clone().text());
  assert.equal(manifest.headers.get('x-waypoint-meshy-pilot'), 'enabled');
  assert.deepEqual(await manifest.json(), [validRecord]);

  const model = await fetch(`${origin}/__meshy/pilot/models/pilot-model.glb`);
  assert.equal(model.status, 200);
  assert.deepEqual(Buffer.from(await model.arrayBuffer()), validModel);
});

test('private metadata and unregistered files are never served', async () => {
  const catalog = await fetch(`${origin}/__meshy/pilot/private-catalog.json`);
  assert.equal((await catalog.text()).includes('private catalog data'), false);

  const traversal = await fetch(`${origin}/__meshy/pilot/models/%2e%2e%2fprivate-catalog.json`);
  assert.equal((await traversal.text()).includes('private catalog data'), false);

  const unknown = await fetch(`${origin}/__meshy/pilot/models/unknown-model.glb`);
  assert.equal(unknown.status, 404);
});

test('Vite generic filesystem routes cannot expose populated private staging files', async () => {
  const genericManifestPath = join(stageDirectory, 'asset-records.json').replaceAll('\\', '/');
  const manifestResponse = await fetch(`${origin}/@fs/${genericManifestPath}`);
  assert.notEqual(manifestResponse.headers.get('x-waypoint-meshy-pilot'), 'enabled');
  assert.notDeepEqual(
    Buffer.from(await manifestResponse.arrayBuffer()),
    Buffer.from(JSON.stringify([validRecord])),
  );

  const genericModelPath = join(stageModels, 'pilot-model.glb').replaceAll('\\', '/');
  const modelResponse = await fetch(`${origin}/@fs/${genericModelPath}`);
  assert.notDeepEqual(Buffer.from(await modelResponse.arrayBuffer()), validModel);
});

test('a staged model symlink that escapes the private root is not served', async (context) => {
  const containedModels = join(stageDirectory, 'models-contained');
  await rename(stageModels, containedModels);
  await writeFile(join(outsideDirectory, 'pilot-model.glb'), validModel);
  try {
    await symlink(outsideDirectory, stageModels, 'junction');
  } catch (error) {
    await rename(containedModels, stageModels);
    context.skip(`The host does not permit creating a directory junction: ${String(error)}`);
    return;
  }

  try {
    const response = await fetch(`${origin}/__meshy/pilot/models/pilot-model.glb`);
    assert.equal(response.status, 404);
    assert.notDeepEqual(Buffer.from(await response.arrayBuffer()), validModel);
  } finally {
    await rm(stageModels, { recursive: true, force: true });
    await rename(containedModels, stageModels);
  }
});

test('a symlink target outside the resolved staging root fails confinement', () => {
  assert.equal(
    isConfinedPath(resolve(stageDirectory), resolve(outsideDirectory, 'outside.glb')),
    false,
  );
});

test('a pilot query without explicit server configuration exposes no private model files', async () => {
  const disabled = await createServer({
    configFile: false,
    plugins: [createMeshyPilotRoutePlugin(undefined)],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await disabled.listen();
  const address = disabled.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/__meshy/pilot/models/pilot-model.glb?assets=meshy`,
    );
    assert.equal((await response.text()).includes('private model bytes'), false);
  } finally {
    await disabled.close();
  }
});
