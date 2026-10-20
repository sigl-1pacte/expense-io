import { iam } from '@/modules/iam'
import { InvalidInput } from '@/shared/errors'
import { parseUuid, readJsonObject, requireRole, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../../_lib/current-actor'

/** F41 : la clé `managerId` est obligatoire ; `null` détache explicitement. */
function managerIdFrom(body: Record<string, unknown>): string | null {
  if (!('managerId' in body)) throw new InvalidInput('Corps de requête invalide')
  const value = body.managerId
  if (value === null) return null
  if (typeof value !== 'string') throw new InvalidInput('Corps de requête invalide')
  try {
    return parseUuid(value)
  } catch {
    throw new InvalidInput('Corps de requête invalide')
  }
}

export const PUT = route(async (request, { params }: RouteContext<{ id: string }>) => {
  const actor = await currentActor()
  requireRole(actor, 'hr_admin')
  const id = parseUuid((await params).id)
  const managerId = managerIdFrom(await readJsonObject(request))
  return Response.json(await iam.assignManager(actor, id, managerId))
})
