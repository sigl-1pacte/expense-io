import { withUserScope } from '@/lib/db'
import { getReceiptUrl } from '@/lib/storage'
import { NotFound } from '@/shared/errors'
import { parseUuid, requireRole, requireSession, route, type RouteContext } from '@/shared/http'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  requireRole(user, 'manager')
  const id = parseUuid((await params).id)

  // F1 : seulement les notes des subordonnés directs, quel que soit leur statut.
  const note = await withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT en.receipt_key FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE en.id = $1 AND u.manager_id = $2`,
      [id, user.id]
    )
    return result.rows[0]
  })
  if (!note) throw new NotFound()

  return Response.json({ url: await getReceiptUrl(note.receipt_key) })
})
