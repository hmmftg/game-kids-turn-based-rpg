import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/*.dev.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4180',
    trace: 'retain-on-failure',
    locale: 'fa-IR',
  },
  projects: [
    {
      name: 'garden-chromium',
      use: {
        ...devices['Galaxy S9+ landscape'],
        viewport: { width: 960, height: 640 },
        launchOptions: {
          args: [
            '--enable-webgl',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4180,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
