import type { Actor } from '@/shared/actor'
import type { Contact, IamStore } from '../ports/IamStore'

export function getContact(store: IamStore) {
  return (actor: Actor, userId: string): Promise<Contact | null> =>
    store.withOrgChart(actor, (org) => org.contact(userId))
}
