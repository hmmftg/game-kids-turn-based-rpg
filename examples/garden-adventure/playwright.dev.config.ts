import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.dev.spec.ts',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    ...devices['Galaxy S9+ landscape'],
    baseURL: 'http://127.0.0.1:4182',
    viewport: { width: 960, height: 640 },
    locale: 'fa-IR',
    trace: 'retain-on-failure',
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
    command: 'npm run dev -- --port 4182 --strictPort',
    port: 4182,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
