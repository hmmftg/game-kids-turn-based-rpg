import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const ROUTE_PREFIX = '/__meshy/pilot/';
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_MODEL_BYTES = 12 * 1024 * 1024;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;

function isLoopback(request) {
  const address = request.socket.remoteAddress ?? '';
  if (!(address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')))
    return false;
  const host = request.headers.host;
  if (typeof host !== 'string') return false;
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

export function isConfinedPath(root, filePath) {
  const relativePath = relative(root, filePath);
  return !(
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  );
}

async function readConfinedFile(root, filePath, limit) {
  const realRoot = await realpath(root).catch(() => null);
  if (!realRoot) return null;
  const actualPath = await realpath(filePath).catch(() => null);
  if (!actualPath) return null;
  if (!isConfinedPath(realRoot, actualPath)) return null;
  const fileInfo = await stat(actualPath).catch(() => null);
  if (!fileInfo?.isFile() || fileInfo.size > limit) return null;
  const bytes = await readFile(actualPath);
  if (bytes.byteLength > limit) return null;
  return bytes;
}

function validateRecords(value) {
  if (!Array.isArray(value)) throw new Error('Pilot asset manifest must be an array.');
  const ids = new Set();
  for (const record of value) {
    if (
      !record ||
      typeof record !== 'object' ||
      !SAFE_ID.test(record.id ?? '') ||
      record.runtimePath !== `models/${record.id}.glb` ||
      !SHA256.test(record.outputSha256 ?? '') ||
      !Number.isSafeInteger(record.metrics?.outputBytes) ||
      record.metrics.outputBytes < 20 ||
      record.metrics.outputBytes > MAX_MODEL_BYTES ||
      ids.has(record.id)
    )
      throw new Error('Pilot asset manifest contains an invalid or duplicate model record.');
    ids.add(record.id);
  }
  return new Set(ids);
}

function send(response, statusCode, contentType, bytes = Buffer.alloc(0), headers = {}) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', bytes.byteLength);
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(bytes);
}

export function createMeshyPilotRoutePlugin(configuredDirectory) {
  if (typeof configuredDirectory !== 'string' || configuredDirectory.trim() === '')
    return { name: 'waypoint-meshy-pilot-disabled' };

  const privateDirectory = resolve(configuredDirectory);
  const installPrivateRoute = (server) => {
    server.middlewares.use(async (request, response, next) => {
      let pathname;
      try {
        pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      } catch {
        next();
        return;
      }
      if (!pathname.startsWith(ROUTE_PREFIX)) {
        next();
        return;
      }
      if (!isLoopback(request)) {
        send(response, 403, 'text/plain; charset=utf-8', Buffer.from('Loopback requests only.'));
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        send(response, 405, 'text/plain; charset=utf-8');
        return;
      }

      const manifestBytes = await readConfinedFile(
        privateDirectory,
        resolve(privateDirectory, 'asset-records.json'),
        MAX_MANIFEST_BYTES,
      );
      if (!manifestBytes) {
        send(
          response,
          404,
          'text/plain; charset=utf-8',
          Buffer.from('Pilot manifest unavailable.'),
        );
        return;
      }

      let modelIds;
      let records;
      try {
        records = JSON.parse(manifestBytes.toString('utf8'));
        modelIds = validateRecords(records);
      } catch {
        send(response, 404, 'text/plain; charset=utf-8', Buffer.from('Pilot manifest is invalid.'));
        return;
      }

      if (pathname === `${ROUTE_PREFIX}asset-records.json`) {
        send(response, 200, 'application/json; charset=utf-8', manifestBytes, {
          'X-Waypoint-Meshy-Pilot': 'enabled',
        });
        return;
      }

      let decodedPath;
      try {
        decodedPath = decodeURIComponent(pathname.slice(ROUTE_PREFIX.length));
      } catch {
        send(response, 404, 'text/plain; charset=utf-8');
        return;
      }
      const match = /^models\/([a-z0-9]+(?:-[a-z0-9]+)*)\.glb$/.exec(decodedPath);
      const assetId = match?.[1];
      if (!assetId || !modelIds.has(assetId)) {
        send(response, 404, 'text/plain; charset=utf-8');
        return;
      }

      const modelPath = resolve(privateDirectory, 'models', `${assetId}.glb`);
      const modelBytes = await readConfinedFile(privateDirectory, modelPath, MAX_MODEL_BYTES);
      const record = records.find((entry) => entry.id === assetId);
      if (!modelBytes || modelBytes.byteLength !== record.metrics.outputBytes) {
        send(response, 404, 'text/plain; charset=utf-8');
        return;
      }
      send(
        response,
        200,
        'model/gltf-binary',
        request.method === 'HEAD' ? Buffer.alloc(0) : modelBytes,
      );
    });
  };
  return {
    name: 'waypoint-meshy-pilot-private-assets',
    enforce: 'pre',
    config(config) {
      config.server = { ...config.server, host: '127.0.0.1' };
    },
    configureServer: installPrivateRoute,
  };
}
