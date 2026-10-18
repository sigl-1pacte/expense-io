import { getPool } from '@/lib/db'
import { Conflict, InvalidInput, NotFound } from '@/shared/errors'
import {
  parseUuid,
  readJsonObject,
  requireRole,
  requireSession,
  route,
  type RouteContext,
} from '@/shared/http'

/** F41 : la clé `managerId` est obligatoire ; `null` détache explicitement. */
function managerIdFrom(body: Record<string, unknown>): string | null {
  if (!('managerId' in body)) throw new InvalidInput('Corps de requête invalide')
  const value = body.managerId
  if (value === null) return null
  if (typeof value !== 'string') throw new InvalidInput('Corps de requête invalide')
  try {
    return parseUuid(value)
  } catch {
    throw new InvalidInput('Corps de requête invalide')
  }
}

export const PUT = route(async (request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  requireRole(user, 'hr_admin')
  const id = parseUuid((await params).id)
  const managerId = managerIdFrom(await readJsonObject(request))

  // Passe sous la portée RLS en tâche 11 ; F5 et F30 au plan 2 (assignManager).
  const hrAdminResult = await getPool().query('SELECT company_id FROM users WHERE id = $1', [user.id])
  const companyId = hrAdminResult.rows[0]?.company_id
  if (!companyId) throw new NotFound()

  const targetResult = await getPool().query(
    `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role IN ('employee', 'manager')`,
    [id, companyId]
  )
  if (!targetResult.rows[0]) throw new NotFound()

  if (managerId !== null) {
    if (managerId === id) throw new Conflict('invalid-manager', 'Invalid manager')
    const managerResult = await getPool().query(
      `SELECT id FROM users WHERE id = $1 AND role = 'manager'`,
      [managerId]
    )
    if (!managerResult.rows[0]) throw new Conflict('invalid-manager', 'Invalid manager')
  }

  const updated = await getPool().query(
    `UPDATE users SET manager_id = $1 WHERE id = $2
     RETURNING id, name, email, role, manager_id`,
    [managerId, id]
  )
  const target = updated.rows[0]
  return Response.json({
    id: target.id,
    name: target.name,
    email: target.email,
    role: target.role,
    managerId: target.manager_id,
  })
})
