import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.preview.ts',
  testIgnore: '**/*.meshy.preview.ts',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4181',
    viewport: { width: 1440, height: 900 },
    locale: 'fa-IR',
    colorScheme: 'light',
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
    command: 'vite preview --host 127.0.0.1 --port 4181',
    port: 4181,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
