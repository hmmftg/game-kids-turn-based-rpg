import react from '@vitejs/plugin-react';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { createMeshyPilotRoutePlugin } from '../../../scripts/meshy-pilot-dev-route.mjs';

const previewRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(previewRoot, '../../..');
const projectRoot = resolve(
  process.env.WAYPOINT_CREATOR_GAME_ROOT ?? resolve(repositoryRoot, 'examples/scene-demo'),
);
const frameworkPackageRoots = ['core', 'narrative', 'gameplay', 'three'].map((name) =>
  resolve(repositoryRoot, 'packages', name, 'dist'),
);

function localAssetRecordRoute(): Plugin {
  return {
    name: 'waypoint-creator-local-asset-records',
    configureServer(server) {
      server.middlewares.use('/__creator/asset-records.json', async (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }
        const realRoot = await realpath(projectRoot).catch(() => null);
        const recordsCandidates = [resolve(projectRoot, 'assets/asset-records.json')];
        if (projectRoot === resolve(repositoryRoot, 'examples/scene-demo'))
          recordsCandidates.push(resolve(projectRoot, 'src/animation/asset-records.json'));
        let realFile: string | null = null;
        for (const candidate of recordsCandidates) {
          realFile = await realpath(candidate).catch(() => null);
          if (realFile) break;
        }
        if (!realRoot || !realFile) {
          response.statusCode = 404;
          response.end('Local project asset-record manifest was not found.');
          return;
        }
        const pathFromRoot = relative(realRoot, realFile);
        if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`)) {
          response.statusCode = 403;
          response.end('Local project manifest must remain inside the game directory.');
          return;
        }
        const bytes = await readFile(realFile);
        if (bytes.byteLength > 2 * 1024 * 1024) {
          response.statusCode = 413;
          response.end('Local asset-record manifest exceeds the 2 MiB preview limit.');
          return;
        }
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(bytes);
      });
    },
  };
}

export default defineConfig({
  root: previewRoot,
  base: './',
  plugins: [
    react(),
    localAssetRecordRoute(),
    createMeshyPilotRoutePlugin(process.env['WAYPOINT_MESHY_PILOT_DIR']),
  ],
  publicDir: resolve(projectRoot, 'public'),
  server: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
    fs: { strict: true, allow: [previewRoot, projectRoot, ...frameworkPackageRoots] },
  },
  build: { target: 'es2022', outDir: resolve(previewRoot, 'dist'), emptyOutDir: true },
});
