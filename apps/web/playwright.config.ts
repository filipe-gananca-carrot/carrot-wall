import { defineConfig, devices } from '@playwright/test';

import { BASE_URL } from './e2e/base-url';

// Under docker compose the api and web services are already running, so Playwright must not
// boot its own — `E2E_BASE_URL` being set is the signal. Unset (a host run), the webServer
// blocks below behave exactly as they always did, so `npm run e2e` is unchanged.
const serversManagedExternally = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: serversManagedExternally
    ? undefined
    : [
        {
          command: 'cd ../api && ./mvnw quarkus:dev',
          url: 'http://localhost:8080/api/wall',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'npm start',
          url: 'http://localhost:4200',
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
});
