import type { Actor } from '@/shared/actor'
import { Unauthenticated } from '@/shared/errors'
import type { IamStore } from '../ports/IamStore'

/** F31 : l'acteur (rôle, entreprise, manager) est relu en base à chaque requête. */
export function getActor(store: IamStore) {
  return async (userId: string): Promise<Actor> => {
    const actor = await store.findActor(userId)
    if (!actor) throw new Unauthenticated()
    return actor
  }
}
