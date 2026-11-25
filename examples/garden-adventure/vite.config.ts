import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import process from 'node:process';

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
  server: { host: '127.0.0.1', port: 4180 },
  preview: { host: '127.0.0.1', port: 4180 },
});
