import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'fa-IR',
  },
  projects: [
    {
      name: 'landscape-mobile',
      use: {
        ...devices['Galaxy S9+ landscape'],
        viewport: { width: 880, height: 420 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: PORT,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
