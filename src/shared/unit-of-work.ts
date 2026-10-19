// Unité de travail : une transaction dont la portée (utilisateur, entreprise)
// est exposée aux policies RLS. Tout ce qui passe par `sql` dans `fn` est
// écrit ensemble, ou pas du tout.
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import { getPool } from './db'
import { logger } from './logger'

export interface Sql {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>
}

export interface Scope {
  userId: string
  companyId: string
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
 * Pose le contexte (utilisateur, entreprise) pour la durée de la transaction :
 * l'isolation est garantie par PostgreSQL (Row Level Security, voir
 * migrations/), ce helper ne fait qu'exposer les ids aux policies.
 */
export async function runInScope<T>(scope: Scope, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  let rollbackFailed = false
  try {
    await warnIfRlsBypassed(client)
    await client.query('BEGIN')
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_company_id', $2, true)",
      [scope.userId, scope.companyId]
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
