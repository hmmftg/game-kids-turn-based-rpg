import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gardenRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(gardenRoot, '../..');
const frameworkPackageRoots = ['core', 'narrative', 'gameplay', 'three'].map((name) =>
  resolve(repositoryRoot, 'packages', name, 'dist'),
);

const plugins = [react()];
const pilotDirectory = process.env['WAYPOINT_MESHY_PILOT_DIR'];
if (pilotDirectory) {
  const routeModule = await import(
    /* @vite-ignore */ new URL('../../scripts/meshy-pilot-dev-route.mjs', import.meta.url).href
  );
  plugins.push(routeModule.createMeshyPilotRoutePlugin(pilotDirectory));
}

export default defineConfig({
  base: './',
  plugins,
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1',
    port: 4180,
    fs: { strict: true, allow: [gardenRoot, ...frameworkPackageRoots] },
  },
  preview: { host: '127.0.0.1', port: 4180 },
});
