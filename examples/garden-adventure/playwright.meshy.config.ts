import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

if (!process.env['WAYPOINT_MESHY_PILOT_DIR'])
  throw new Error('Set WAYPOINT_MESHY_PILOT_DIR to the private pilot staging directory.');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.meshy.preview.ts',
  timeout: 240_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4182',
    viewport: { width: 1440, height: 900 },
    locale: 'fa-IR',
    colorScheme: 'light',
    serviceWorkers: 'block',
    launchOptions: {
      args: [
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'npm run build && vite preview --host 127.0.0.1 --port 4182',
    port: 4182,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      WAYPOINT_MESHY_PILOT_DIR: process.env['WAYPOINT_MESHY_PILOT_DIR'],
    },
  },
});
