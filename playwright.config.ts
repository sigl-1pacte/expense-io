import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, E2E_ENV, E2E_PORT } from './tests/support/env'

// Les helpers de test (factories) lisent DATABASE_URL : on les pointe sur la
// base E2E, dans le process principal comme dans les workers (qui rechargent
// ce fichier).
Object.assign(process.env, E2E_ENV)

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    // Les dates sont formatées dans le fuseau du navigateur.
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build de production, au plus près de la prod ; port distinct de `make dev`.
    command: `npm run build && npm run start -- -p ${E2E_PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    // L'environnement du process prime sur .env : l'app vise la base et le
    // bucket E2E. AUTH_TRUST_HOST est requis par Auth.js en `next start`.
    env: { ...E2E_ENV, AUTH_TRUST_HOST: 'true' },
  },
})
