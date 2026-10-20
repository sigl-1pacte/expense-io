import { expenses, MAX_RECEIPT_BYTES } from '@/modules/expenses'
import { InvalidInput } from '@/shared/errors'
import { MULTIPART_OVERHEAD_BYTES, readFormData, route } from '@/shared/http'
import { currentActor } from '../../_lib/current-actor'

export const POST = route(async (request) => {
  await currentActor()
  const form = await readFormData(request, MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES, 'Fichier trop volumineux')
  const receipt = form.get('receipt')
  if (!(receipt instanceof File)) throw new InvalidInput('Champs invalides')
  return Response.json(
    await expenses.suggestFromReceipt({
      type: receipt.type,
      size: receipt.size,
      read: async () => new Uint8Array(await receipt.arrayBuffer()),
    })
  )
})
