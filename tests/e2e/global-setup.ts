import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeTestDb, truncateAll } from '../support/db'
import { E2E_DATABASE_NAME, E2E_ENV } from '../support/env'
import { emptyBucket, ensureBucket, ensureDatabase, migrate } from '../support/infra'
import { clearMailpit } from '../support/mailpit'

const WORKER_STOP_TIMEOUT_MS = 5_000

export default async function setupE2e(): Promise<() => Promise<void>> {
  await ensureDatabase(E2E_DATABASE_NAME)
  await migrate(E2E_ENV.DATABASE_OWNER_URL)
  await truncateAll()
  await closeTestDb()
  await ensureBucket(E2E_ENV)
  // Les clés receipts/N repartent de 1 à chaque run : pas d'objet d'un run précédent.
  await emptyBucket(E2E_ENV)
  await clearMailpit()
  // Sans shell : sur Windows, tuer un shell laisserait le worker orphelin.
  const worker = spawn(process.execPath, ['--import', 'tsx', 'src/worker/mail-worker.ts'], {
    env: { ...process.env, ...E2E_ENV, MAIL_POLL_INTERVAL_MS: '200' },
    stdio: 'inherit',
  })
  return async () => {
    if (worker.exitCode !== null || worker.signalCode !== null) return
    const exited = once(worker, 'exit')
    worker.kill('SIGTERM')
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(resolve, WORKER_STOP_TIMEOUT_MS, 'timeout'))
    if ((await Promise.race([exited, timeout])) === 'timeout') {
      worker.kill('SIGKILL')
      await exited
    }
  }
}
