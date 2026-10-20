import { expenses } from '@/modules/expenses'
import { parseUuid, requireRole, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../../_lib/current-actor'

export const POST = route(async (_request, { params }: RouteContext<{ id: string }>, meta) => {
  const actor = await currentActor()
  requireRole(actor, 'manager')
  const id = parseUuid((await params).id)
  return Response.json(await expenses.decideExpenseNote(actor, id, 'approved', meta.correlationId))
})
