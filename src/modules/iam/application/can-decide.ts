import type { Actor } from '@/shared/actor'
import { canDecide as canDecideIn } from '../domain/ApprovalPolicy'
import type { IamStore } from '../ports/IamStore'

export function canDecide(store: IamStore) {
  return (actor: Actor, ownerId: string): Promise<boolean> =>
    store.withOrgChart(actor, async (org) => {
      const members = await org.members()
      const owner = members.find((member) => member.id === ownerId)
      return owner ? canDecideIn(actor.id, owner, members) : false
    })
}
