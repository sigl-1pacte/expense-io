import { Pool, types, type PoolClient } from 'pg'
import { Unauthenticated } from '@/shared/errors'
import { logger } from '@/shared/logger'

// OID 1082 = date. Garde la chaîne "YYYY-MM-DD" brute renvoyée par Postgres
// plutôt qu'un objet Date JS calé sur le fuseau local.
types.setTypeParser(1082, (value: string) => value)

declare global {
  var __pgPool: Pool | undefined
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set')
    }
    global.__pgPool = new Pool({ connectionString, max: 20 })
  }
  return global.__pgPool
}

let rlsBypassChecked = false

/**
 * Une fois par process : prévient si DATABASE_URL pointe un rôle qui contourne
 * la RLS (superutilisateur ou BYPASSRLS), ce qui ruinerait l'isolation. Ne lève jamais.
 */
async function warnIfRlsBypassed(client: PoolClient): Promise<void> {
  if (rlsBypassChecked) return
  rlsBypassChecked = true
  try {
    const { rows } = await client.query<{ bypass: boolean }>(
      'SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user'
    )
    if (rows[0]?.bypass) {
      logger.warn(
        'DATABASE_URL utilise un rôle qui contourne la RLS : mettre à jour .env (voir docs/runbooks/dev-environnement-demarrer.md)'
      )
    }
  } catch {
    // Contrôle de confort : un échec ici ne doit pas faire échouer la requête.
  }
}

/**
 * Pose le contexte utilisateur pour la durée de la transaction — l'isolation
 * entre utilisateurs et entre entreprises est garantie par PostgreSQL (Row
 * Level Security, voir migrations/), ce helper ne fait qu'exposer l'id
 * courant aux policies.
 */
export async function withUserScope<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()
  let rollbackFailed = false
  try {
    await warnIfRlsBypassed(client)
    await client.query('BEGIN')
    // L'entreprise de l'acteur sert à l'isolation RLS (company_id). Acteur
    // supprimé : la session ne vaut plus rien, 401.
    const actor = await client.query<{ company_id: string }>(
      'SELECT company_id FROM app.actor($1)',
      [userId]
    )
    if (!actor.rows[0]) throw new Unauthenticated()
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_company_id', $2, true)",
      [userId, actor.rows[0].company_id]
    )
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    // Un ROLLBACK qui échoue ne doit pas masquer l'erreur d'origine.
    try {
      await client.query('ROLLBACK')
    } catch {
      rollbackFailed = true
    }
    throw error
  } finally {
    // Connexion dans un état inconnu : on la détruit au lieu de la rendre au pool.
    client.release(rollbackFailed ? true : undefined)
  }
}
