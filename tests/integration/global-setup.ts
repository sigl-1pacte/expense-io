import { TEST_DATABASE_NAME, TEST_ENV } from '../support/env'
import { ensureBucket, ensureDatabase, migrate } from '../support/infra'

export default async function setupIntegration(): Promise<void> {
  await ensureDatabase(TEST_DATABASE_NAME)
  await migrate(TEST_ENV.DATABASE_URL)
  await ensureBucket(TEST_ENV)
}
