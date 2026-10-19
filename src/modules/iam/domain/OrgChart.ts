// Règles de l'organigramme, vérifiées à chaque modification (F5, F30). Le
// parcours se fait sur les membres chargés sous le verrou d'organigramme de
// l'entreprise : deux rattachements simultanés ne peuvent pas fermer un cycle.
import { NotFound } from '@/shared/errors'
import type { OrgMember } from './ApprovalPolicy'
import { InvalidManager } from './errors'

export function assertCanAssign(
  targetId: string,
  managerId: string | null,
  members: readonly OrgMember[]
): void {
  const byId = new Map(members.map((member) => [member.id, member]))
  const target = byId.get(targetId)
  if (!target || (target.role !== 'employee' && target.role !== 'manager')) throw new NotFound()
  if (managerId === null) return

  const manager = byId.get(managerId)
  // Absent de `members` = inconnu ou d'une autre entreprise (F5).
  if (!manager || manager.role !== 'manager' || manager.id === targetId) throw new InvalidManager()

  // F30 : la cible ne doit pas être un ancêtre du manager choisi.
  const seen = new Set<string>()
  let cursor: OrgMember | undefined = manager
  while (cursor?.managerId && !seen.has(cursor.id)) {
    if (cursor.managerId === targetId) throw new InvalidManager()
    seen.add(cursor.id)
    cursor = byId.get(cursor.managerId)
  }
}
