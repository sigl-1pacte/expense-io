import { withUserScope } from '@/lib/db'
import { requireRole, requireSession, route } from '@/shared/http'

function toExpenseNote(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number.parseFloat(row.amount as string),
    expenseDate: row.expense_date,
    description: row.description,
    receiptKey: row.receipt_key,
    status: row.status,
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export const GET = route(async () => {
  const user = await requireSession()
  requireRole(user, 'manager')

  return withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT en.* FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE u.manager_id = $1 AND en.status = 'pending'
       ORDER BY en.created_at ASC`,
      [user.id]
    )
    return Response.json(result.rows.map(toExpenseNote))
  })
})
