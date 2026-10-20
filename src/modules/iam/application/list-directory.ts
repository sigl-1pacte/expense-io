import type { Actor } from '@/shared/actor'
import type { DirectoryUser, IamStore } from '../ports/IamStore'

export function listDirectory(store: IamStore) {
  return (actor: Actor): Promise<DirectoryUser[]> => store.withOrgChart(actor, (org) => org.directory())
}
