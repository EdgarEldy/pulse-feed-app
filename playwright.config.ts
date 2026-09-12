import { defineConfig, devices } from '@playwright/test';

/**
 * README's "one end-to-end Playwright test: sign up, create a post, like
 * it, comment on it" (feature/quality-and-release). This app has no
 * bundled mock backend (it is deliberately backend-agnostic, see the API
 * Contract section), so this suite drives the real, served web build in a
 * real browser while intercepting just the network calls the golden-path
 * flow makes, via Playwright's own `page.route()` (see `e2e/mocks.ts`) —
 * no separate mock server process, no new dependency beyond `playwright`
 * itself, which is already in README's Tech Stack table.
 *
 * `webServer` below starts `ng serve` and waits for it to be ready, so
 * `npm run e2e` is a single self-contained command; CI does not run this
 * suite today (see `.github/workflows/ci.yml`), since a real project
 * would still need its own account/data cleanup strategy against a real
 * backend before wiring this into every PR.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start -- --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
