import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Périmètre : le code que Vitest exécute réellement. Hors périmètre :
      // - src/domain, src/ports, src/adapters, src/utils : code mort (audit §2),
      //   à traiter au plan 2 ;
      // - src/lib/auth.ts, src/proxy.ts, src/app/api/auth/** : mockés ici,
      //   couverts par Playwright ;
      // - pages, layout et composants React : couverts par Playwright ;
      // - src/types : déclarations seules.
      include: [
        'src/app/api/**/*.ts',
        'src/app/actions/**/*.ts',
        'src/shared/**/*.ts',
        'src/lib/db.ts',
        'src/lib/note-sort.ts',
        'src/lib/ocr.ts',
        'src/lib/storage.ts',
      ],
      exclude: ['src/app/api/auth/**'],
      thresholds: { lines: 97, branches: 94, functions: 100 },
    },
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
