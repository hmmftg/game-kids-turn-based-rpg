import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'vite';

const repositoryRoot = resolve(import.meta.dirname, '..');
const gardenRoot = resolve(repositoryRoot, 'examples/garden-adventure');

test('Garden Vite denies generic filesystem routes to repository-private files', async () => {
  const privateRoot = await mkdtemp(join(repositoryRoot, '.garden-private-fs-'));
  const secretPath = join(privateRoot, 'private-model.glb');
  const marker = Buffer.from('private source and staging marker');
  let server;
  try {
    await writeFile(secretPath, marker);
    server = await createServer({
      root: gardenRoot,
      configFile: resolve(gardenRoot, 'vite.config.ts'),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'silent',
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    const genericPath = secretPath.replaceAll('\\', '/');
    const response = await fetch(`http://127.0.0.1:${address.port}/@fs/${genericPath}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.notEqual(response.status, 200);
    assert.notDeepEqual(bytes, marker);
  } finally {
    await server?.close();
    await rm(privateRoot, { recursive: true, force: true });
  }
});

test('creator preview denies generic filesystem routes to repository-private files', async () => {
  const privateRoot = await mkdtemp(join(repositoryRoot, '.creator-private-fs-'));
  const secretPath = join(privateRoot, 'private-model.glb');
  const marker = Buffer.from('private local model source');
  const previousProjectRoot = process.env['WAYPOINT_CREATOR_GAME_ROOT'];
  let server;
  try {
    await writeFile(secretPath, marker);
    process.env['WAYPOINT_CREATOR_GAME_ROOT'] = gardenRoot;
    const previewRoot = resolve(repositoryRoot, 'tools/creator/preview');
    server = await createServer({
      root: previewRoot,
      configFile: resolve(previewRoot, 'vite.config.ts'),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'silent',
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    const genericPath = secretPath.replaceAll('\\', '/');
    const response = await fetch(`http://127.0.0.1:${address.port}/@fs/${genericPath}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.notEqual(response.status, 200);
    assert.notDeepEqual(bytes, marker);
  } finally {
    await server?.close();
    if (previousProjectRoot === undefined) delete process.env['WAYPOINT_CREATOR_GAME_ROOT'];
    else process.env['WAYPOINT_CREATOR_GAME_ROOT'] = previousProjectRoot;
    await rm(privateRoot, { recursive: true, force: true });
  }
});
