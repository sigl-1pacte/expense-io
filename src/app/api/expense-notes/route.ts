import path from 'node:path'
import { withUserScope } from '@/lib/db'
import { receiptKeyFor, uploadReceipt } from '@/lib/storage'
import { InvalidInput } from '@/shared/errors'
import {
  MAX_RECEIPT_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  readFormData,
  requireSession,
  route,
} from '@/shared/http'

const ALLOWED_RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

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

export const GET = route(async (request) => {
  const user = await requireSession()
  const url = new URL(request.url)
  // F3 corrigé en tâche 13 (liste blanche).
  const sort = url.searchParams.get('sort') || 'created_at DESC'

  return withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT * FROM expense_notes WHERE user_id = $1 ORDER BY ${sort}`,
      [user.id]
    )
    return Response.json(result.rows.map(toExpenseNote))
  })
})

export const POST = route(async (request) => {
  const user = await requireSession()
  const formData = await readFormData(
    request,
    MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES,
    'Fichier trop volumineux'
  )
  const amountRaw = formData.get('amount')
  const expenseDate = formData.get('expenseDate')
  const description = formData.get('description')
  const receipt = formData.get('receipt')

  const amount = typeof amountRaw === 'string' ? Number.parseFloat(amountRaw) : NaN

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof expenseDate !== 'string' ||
    typeof description !== 'string' ||
    description.trim().length === 0 ||
    !(receipt instanceof File)
  ) {
    throw new InvalidInput('Champs invalides')
  }
  if (!ALLOWED_RECEIPT_TYPES.includes(receipt.type)) {
    throw new InvalidInput('Type de fichier non autorisé pour le reçu')
  }
  if (receipt.size > MAX_RECEIPT_BYTES) {
    throw new InvalidInput('Fichier trop volumineux')
  }

  const note = await withUserScope(user.id, async (client) => {
    const inserted = await client.query(
      `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user.id, amount, expenseDate, description, '']
    )
    return inserted.rows[0]
  })

  const extension = EXTENSION_BY_MIME[receipt.type] ?? path.extname(receipt.name) ?? ''
  const receiptKey = receiptKeyFor(note.receipt_seq, extension)
  const buffer = Buffer.from(await receipt.arrayBuffer())
  await uploadReceipt(receiptKey, buffer, receipt.type)

  // Ordre S3 puis note au plan 2 (F10).
  const updated = await withUserScope(user.id, (client) =>
    client.query(`UPDATE expense_notes SET receipt_key = $1 WHERE id = $2 RETURNING *`, [
      receiptKey,
      note.id,
    ])
  )

  return Response.json(toExpenseNote(updated.rows[0]), { status: 201 })
})
