import { withUserScope } from '@/lib/db'
import { getReceiptUrl } from '@/lib/storage'
import { NotFound } from '@/shared/errors'
import { parseUuid, requireSession, route, type RouteContext } from '@/shared/http'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  const id = parseUuid((await params).id)

  const note = await withUserScope(user.id, async (client) => {
    const result = await client.query(
      'SELECT receipt_key FROM expense_notes WHERE id = $1 AND user_id = $2',
      [id, user.id]
    )
    return result.rows[0]
  })
  if (!note) throw new NotFound()

  return Response.json({ url: await getReceiptUrl(note.receipt_key) })
})
