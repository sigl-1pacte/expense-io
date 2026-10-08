import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Même fuseau en local et en CI.
          env: { TZ: 'UTC' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // DATABASE_URL et S3_* sont posés par setup.ts (TEST_ENV).
          env: { TZ: 'UTC' },
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          // Base partagée : un fichier à la fois.
          fileParallelism: false,
          hookTimeout: 30_000,
          // next-auth importe `next/server` sans extension, ce que Node refuse
          // en ESM : Vitest doit transformer le paquet lui-même.
          server: { deps: { inline: ['next-auth'] } },
        },
      },
    ],
  },
})
