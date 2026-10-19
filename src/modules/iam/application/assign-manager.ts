import type { Actor } from '@/shared/actor'
import { assertCanAssign } from '../domain/OrgChart'
import type { DirectoryUser, IamStore } from '../ports/IamStore'

/** F5, F30 : vérification et écriture dans la même transaction, sous le verrou d'organigramme. */
export function assignManager(store: IamStore) {
  return (actor: Actor, targetId: string, managerId: string | null): Promise<DirectoryUser> =>
    store.withOrgChart(actor, async (org) => {
      await org.lock()
      assertCanAssign(targetId, managerId, await org.members())
      return org.setManager(targetId, managerId)
    })
}
