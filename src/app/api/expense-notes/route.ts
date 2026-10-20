import { expenses, MAX_RECEIPT_BYTES, parseSubmission, type ReceiptFile } from '@/modules/expenses'
import { MULTIPART_OVERHEAD_BYTES, readFormData, route } from '@/shared/http'
import { currentActor } from '../_lib/current-actor'

function receiptFrom(value: FormDataEntryValue | null): ReceiptFile | null {
  if (!(value instanceof File)) return null
  return {
    name: value.name,
    type: value.type,
    size: value.size,
    read: async () => new Uint8Array(await value.arrayBuffer()),
  }
}

export const GET = route(async (request) => {
  const actor = await currentActor()
  const sort = new URL(request.url).searchParams.get('sort')
  return Response.json(await expenses.listMyExpenseNotes(actor, sort))
})

export const POST = route(async (request) => {
  const actor = await currentActor()
  const form = await readFormData(request, MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES, 'Fichier trop volumineux')
  const submission = parseSubmission({
    amount: form.get('amount'),
    expenseDate: form.get('expenseDate'),
    description: form.get('description'),
    receipt: receiptFrom(form.get('receipt')),
  })
  return Response.json(await expenses.submitExpenseNote(actor, submission), { status: 201 })
})
