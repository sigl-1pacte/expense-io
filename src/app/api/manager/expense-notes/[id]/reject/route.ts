import { withUserScope } from '@/lib/db'
import { Conflict, NotFound } from '@/shared/errors'
import { parseUuid, requireRole, requireSession, route, type RouteContext } from '@/shared/http'

export const POST = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  requireRole(user, 'manager')
  const id = parseUuid((await params).id)

  return withUserScope(user.id, async (client) => {
    const existing = await client.query(
      `SELECT en.* FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE en.id = $1 AND u.manager_id = $2`,
      [id, user.id]
    )
    const row = existing.rows[0]
    if (!row) throw new NotFound()
    if (row.status !== 'pending') throw new Conflict('already-decided', 'Already decided')

    const updated = await client.query(
      `UPDATE expense_notes SET status = 'rejected' WHERE id = $1 RETURNING *`,
      [id]
    )
    const note = updated.rows[0]
    return Response.json({
      id: note.id,
      userId: note.user_id,
      amount: Number.parseFloat(note.amount),
      expenseDate: note.expense_date,
      description: note.description,
      receiptKey: note.receipt_key,
      status: note.status,
      createdAt: new Date(note.created_at).toISOString(),
    })
  })
})
