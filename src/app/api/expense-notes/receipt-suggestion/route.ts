import { suggestFields } from '@/lib/ocr'
import { InvalidInput } from '@/shared/errors'
import {
  MAX_RECEIPT_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  readFormData,
  requireSession,
  route,
} from '@/shared/http'

export const POST = route(async (request) => {
  await requireSession()
  const formData = await readFormData(
    request,
    MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES,
    'Fichier trop volumineux'
  )
  const receipt = formData.get('receipt')
  if (!(receipt instanceof File)) throw new InvalidInput('Champs invalides')

  const buffer = Buffer.from(await receipt.arrayBuffer())
  return Response.json(await suggestFields({ data: buffer, mimeType: receipt.type }))
})
