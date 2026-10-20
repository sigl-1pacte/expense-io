// Ressources dédiées aux tests : jamais la base ni le bucket de `make dev`.
// Les valeurs par défaut correspondent au docker-compose (et aux services CI).
const PG_SERVER_URL = process.env.TEST_PG_SERVER_URL ?? 'postgres://expense:expense@localhost:5433'

/** Même serveur, autre rôle (créé par les migrations ; mot de passe de dev = nom du rôle). */
function roleServerUrl(ownerUrl: string, role: string): string {
  const url = new URL(ownerUrl)
  url.username = role
  url.password = role
  return url.toString().replace(/\/$/, '')
}
/** Rôle applicatif `expense_app`, soumis à la RLS. */
const PG_APP_SERVER_URL = roleServerUrl(PG_SERVER_URL, 'expense_app')
/** Rôle `expense_mailer` du worker de livraison, limité à `mail_outbox`. */
const PG_MAILER_SERVER_URL = roleServerUrl(PG_SERVER_URL, 'expense_mailer')

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
  // Application : rôle expense_app, soumis à la RLS.
  DATABASE_URL: `${PG_APP_SERVER_URL}/${TEST_DATABASE_NAME}`,
  // Helpers de test (factories, truncate) et migrations : toujours le propriétaire.
  DATABASE_OWNER_URL: `${PG_SERVER_URL}/${TEST_DATABASE_NAME}`,
  APP_DATABASE_URL: `${PG_APP_SERVER_URL}/${TEST_DATABASE_NAME}`,
  MAILER_DATABASE_URL: `${PG_MAILER_SERVER_URL}/${TEST_DATABASE_NAME}`,
  S3_BUCKET: 'receipts-test',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Expense.io <no-reply@expense.io>',
  MAILPIT_URL: process.env.TEST_MAILPIT_URL ?? 'http://localhost:8025',
}

export const E2E_ENV = {
  ...S3_BASE_ENV,
  DATABASE_URL: `${PG_APP_SERVER_URL}/${E2E_DATABASE_NAME}`,
  DATABASE_OWNER_URL: `${PG_SERVER_URL}/${E2E_DATABASE_NAME}`,
  APP_DATABASE_URL: `${PG_APP_SERVER_URL}/${E2E_DATABASE_NAME}`,
  MAILER_DATABASE_URL: `${PG_MAILER_SERVER_URL}/${E2E_DATABASE_NAME}`,
  AUTH_SECRET: 'secret-de-test-e2e-uniquement-0123456789',
  S3_BUCKET: 'receipts-e2e',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Expense.io <no-reply@expense.io>',
  MAILPIT_URL: process.env.TEST_MAILPIT_URL ?? 'http://localhost:8025',
}

export const E2E_PORT = 3100
export const BASE_URL = `http://localhost:${E2E_PORT}`
