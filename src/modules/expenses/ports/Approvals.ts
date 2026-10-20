import type { Actor } from '@/shared/actor'

/** Ce qu'expenses demande à iam (D4 : deux requêtes, frontière stricte). */
export interface Approvals {
  approveesOf(actor: Actor): Promise<string[]>
  canDecide(actor: Actor, ownerId: string): Promise<boolean>
}
