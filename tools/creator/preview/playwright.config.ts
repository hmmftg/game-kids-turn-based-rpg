import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

export default defineConfig({
  testDir: '.',
  testMatch: ['creator-preview.spec.ts'],
  outputDir: './test-results',
  fullyParallel: true,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4175',
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
    command: 'npx vite --config preview/vite.config.ts',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
