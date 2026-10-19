import { withUserScope } from '@/lib/db'
import { requireRole, requireSession, route } from '@/shared/http'

export const GET = route(async () => {
  const user = await requireSession()
  requireRole(user, 'hr_admin')

  const result = await withUserScope(user.id, (client) =>
    client.query(
      `SELECT id, name, email, role, manager_id FROM users
       WHERE role IN ('employee', 'manager')
         AND company_id = (SELECT company_id FROM users WHERE id = $1)
       ORDER BY name`,
      [user.id]
    )
  )
  return Response.json(
    result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      managerId: row.manager_id,
    }))
  )
})
