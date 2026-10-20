import type { Actor } from '@/shared/actor'
import { approveesOf as approveesIn } from '../domain/ApprovalPolicy'
import type { IamStore } from '../ports/IamStore'

export function approveesOf(store: IamStore) {
  return (actor: Actor): Promise<string[]> =>
    store.withOrgChart(actor, async (org) => approveesIn(actor.id, await org.members()))
}
