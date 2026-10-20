import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTestDb, truncateAll } from '../support/db'
import { E2E_DATABASE_NAME, E2E_ENV } from '../support/env'
import { emptyBucket, ensureBucket, ensureDatabase, migrate } from '../support/infra'
import { clearMailpit } from '../support/mailpit'

const WORKER_STOP_TIMEOUT_MS = 5_000
const WORKER_STARTUP_CHECK_MS = 2_000
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..')

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
  const worker = spawn(process.execPath, ['--import', 'tsx', resolve(REPO_ROOT, 'src/worker/mail-worker.ts')], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...E2E_ENV, MAIL_POLL_INTERVAL_MS: '200' },
    stdio: 'inherit',
  })
  // Un worker qui sort tout de suite (variable manquante, base injoignable) : échec net plutôt que des tests en timeout.
  await new Promise<void>((resolveStart, rejectStart) => {
    const timer = setTimeout(() => {
      worker.off('exit', onExit)
      resolveStart()
    }, WORKER_STARTUP_CHECK_MS)
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer)
      rejectStart(new Error(`Le worker d'e-mails s'est arrêté au démarrage (code ${code}, signal ${signal})`))
    }
    worker.once('exit', onExit)
    worker.once('error', (error) => {
      clearTimeout(timer)
      rejectStart(error)
    })
  })
  return async () => {
    if (worker.exitCode !== null || worker.signalCode !== null) return
    const exited = once(worker, 'exit')
    worker.kill('SIGTERM')
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<'timeout'>((resolveTimeout) => {
      timer = setTimeout(resolveTimeout, WORKER_STOP_TIMEOUT_MS, 'timeout')
    })
    const outcome = await Promise.race([exited, timeout])
    clearTimeout(timer)
    if (outcome === 'timeout') {
      worker.kill('SIGKILL')
      await exited
    }
  }
}
