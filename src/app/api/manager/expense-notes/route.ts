import { expenses } from '@/modules/expenses'
import { requireRole, route } from '@/shared/http'
import { currentActor } from '../../_lib/current-actor'

export const GET = route(async () => {
  const actor = await currentActor()
  requireRole(actor, 'manager')
  return Response.json(await expenses.listPendingApprovals(actor))
})
