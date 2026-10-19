// Adapter d'entrée : la session prouve l'identité, iam fournit l'acteur à
// jour (rôle, entreprise). Un compte supprimé donne 401 (F31).
import { iam } from '@/modules/iam'
import type { Actor } from '@/shared/actor'
import { requireSession } from '@/shared/http'

export async function currentActor(): Promise<Actor> {
  const session = await requireSession()
  return iam.getActor(session.id)
}
