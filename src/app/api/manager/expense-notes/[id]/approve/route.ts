import { expenses } from '@/modules/expenses'
import { parseUuid, requireRole, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../../_lib/current-actor'
import { readDecisionComment } from '../../../../_lib/decision-comment'

export const POST = route(async (request, { params }: RouteContext<{ id: string }>, meta) => {
  const actor = await currentActor()
  requireRole(actor, 'manager')
  const id = parseUuid((await params).id)
  return Response.json(await expenses.decideExpenseNote(actor, id, 'approved', meta.correlationId, await readDecisionComment(request)))
})
