// Seule source de vérité de « qui valide qui » (ADR 0002). La RLS n'assure
// que l'isolation entre entreprises : `members` est la liste des membres
// d'UNE entreprise.
import type { Role } from '@/shared/actor'

export interface OrgMember {
  id: string
  role: Role
  managerId: string | null
}

/**
 * Consigne : un manager ne valide que ses subordonnés directs ; un RH valide
 * les managers racines, jamais sa propre note. Extension de l'équipe (F14,
 * F33) : un RH valide aussi les employés non rattachés et les autres RH.
 */
export function approversOf(owner: OrgMember, members: readonly OrgMember[]): string[] {
  if (owner.managerId !== null) return [owner.managerId]
  return members.filter((member) => member.role === 'hr_admin' && member.id !== owner.id).map((member) => member.id)
}

export function canDecide(actorId: string, owner: OrgMember, members: readonly OrgMember[]): boolean {
  return owner.id !== actorId && approversOf(owner, members).includes(actorId)
}

/** Ids des membres dont `actorId` valide les notes. */
export function approveesOf(actorId: string, members: readonly OrgMember[]): string[] {
  return members.filter((member) => canDecide(actorId, member, members)).map((member) => member.id)
}
