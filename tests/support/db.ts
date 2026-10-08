import { Pool } from 'pg'

/**
 * Garde-fou : les helpers de test vident les tables. Ils refusent toute base
 * qui n'est pas dédiée aux tests (suffixe `_test` ou `_e2e`).
 */
export function assertTestDatabase(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  const name = new URL(connectionString).pathname.slice(1)
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(`Base "${name}" refusée : les tests n'utilisent que des bases *_test ou *_e2e.`)
  }
  return connectionString
}

let pool: Pool | undefined

/** Pool des helpers de test, distinct de celui de l'application (`global.__pgPool`). */
export function testDb(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: assertTestDatabase(process.env.DATABASE_URL), max: 4 })
  }
  return pool
}

export async function closeTestDb(): Promise<void> {
  await pool?.end()
  pool = undefined
}

/** `RESTART IDENTITY` remet `receipt_seq` à 1 : clés de reçu déterministes. */
export async function truncateAll(): Promise<void> {
  await testDb().query('TRUNCATE expense_notes, users, companies RESTART IDENTITY CASCADE')
}
