import { closeTestDb, truncateAll } from '../support/db'
import { E2E_DATABASE_NAME, E2E_ENV } from '../support/env'
import { emptyBucket, ensureBucket, ensureDatabase, migrate } from '../support/infra'

export default async function setupE2e(): Promise<void> {
  await ensureDatabase(E2E_DATABASE_NAME)
  await migrate(E2E_ENV.DATABASE_OWNER_URL)
  await truncateAll()
  await closeTestDb()
  await ensureBucket(E2E_ENV)
  // Les clés receipts/N repartent de 1 à chaque run : pas d'objet d'un run précédent.
  await emptyBucket(E2E_ENV)
}
