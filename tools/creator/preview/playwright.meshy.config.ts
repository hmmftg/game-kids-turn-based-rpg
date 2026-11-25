import { defineConfig, devices } from '@playwright/test';
import { join, resolve } from 'node:path';
import os from 'node:os';
import process from 'node:process';

if (!process.env['WAYPOINT_MESHY_PILOT_DIR'])
  throw new Error('Set WAYPOINT_MESHY_PILOT_DIR to the private pilot staging directory.');

const externalOutput = resolve(
  process.env['WAYPOINT_MESHY_SCREENSHOT_DIR'] ??
    join(os.tmpdir(), 'waypoint-rpg-meshy-pilot', 'screenshots', 'creator-preview'),
);
const pilotPort = 4176;

export default defineConfig({
  testDir: '.',
  testMatch: ['creator-meshy-preview.spec.ts'],
  outputDir: join(externalOutput, 'playwright-results'),
  fullyParallel: false,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${pilotPort}`,
    headless: true,
    launchOptions: {
      args: [
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `npx vite --config preview/vite.config.ts --port ${pilotPort}`,
    url: `http://127.0.0.1:${pilotPort}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
