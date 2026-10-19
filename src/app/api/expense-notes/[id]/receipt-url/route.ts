import { expenses } from '@/modules/expenses'
import { parseUuid, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../_lib/current-actor'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const actor = await currentActor()
  const id = parseUuid((await params).id)
  return Response.json({ url: await expenses.getReceiptUrl(actor, id, 'author') })
})
