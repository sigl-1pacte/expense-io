import type { Actor } from '@/shared/actor'

/** Ce qu'expenses demande à iam (D4 : deux requêtes, frontière stricte). */
export interface Approvals {
  approveesOf(actor: Actor): Promise<string[]>
  canDecide(actor: Actor, ownerId: string): Promise<boolean>
  /** Nom et e-mail d'un membre de l'entreprise de l'acteur ; `null` s'il n'existe plus. */
  contactOf(actor: Actor, userId: string): Promise<{ name: string; email: string } | null>
}
