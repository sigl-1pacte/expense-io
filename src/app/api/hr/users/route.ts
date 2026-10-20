import { iam } from '@/modules/iam'
import { requireRole, route } from '@/shared/http'
import { currentActor } from '../../_lib/current-actor'

export const GET = route(async () => {
  const actor = await currentActor()
  requireRole(actor, 'hr_admin')
  return Response.json(await iam.listDirectory(actor))
})
