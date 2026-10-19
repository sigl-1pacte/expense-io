// Pont temporaire pendant la migration des routes (plan 2) : supprimé en tâche 11.
import type { PoolClient } from 'pg'
import { getPool } from '@/shared/db'
import { Unauthenticated } from '@/shared/errors'
import { runInScope } from '@/shared/unit-of-work'

export { getPool }

export async function withUserScope<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  // Acteur supprimé : la session ne vaut plus rien, 401.
  const actor = await getPool().query<{ company_id: string }>(
    'SELECT company_id FROM app.actor($1)',
    [userId]
  )
  if (!actor.rows[0]) throw new Unauthenticated()
  return runInScope({ userId, companyId: actor.rows[0].company_id }, (sql) => fn(sql as PoolClient))
}
