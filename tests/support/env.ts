// Ressources dédiées aux tests : jamais la base ni le bucket de `make dev`.
// Les valeurs par défaut correspondent au docker-compose (et aux services CI).
const PG_SERVER_URL = process.env.TEST_PG_SERVER_URL ?? 'postgres://expense:expense@localhost:5433'

export const PG_ADMIN_URL = `${PG_SERVER_URL}/postgres`
export const TEST_DATABASE_NAME = 'expense_io_test'
export const E2E_DATABASE_NAME = 'expense_io_e2e'

const S3_BASE_ENV = {
  S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:4567',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  S3_FORCE_PATH_STYLE: 'true',
}

export const TEST_ENV = {
  ...S3_BASE_ENV,
  DATABASE_URL: `${PG_SERVER_URL}/${TEST_DATABASE_NAME}`,
  S3_BUCKET: 'receipts-test',
}

export const E2E_ENV = {
  ...S3_BASE_ENV,
  DATABASE_URL: `${PG_SERVER_URL}/${E2E_DATABASE_NAME}`,
  S3_BUCKET: 'receipts-e2e',
}

export const E2E_PORT = 3100
export const BASE_URL = `http://localhost:${E2E_PORT}`
