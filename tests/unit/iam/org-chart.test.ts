import { describe, expect, it } from 'vitest'
import { InvalidManager } from '@/modules/iam/domain/errors'
import type { OrgMember } from '@/modules/iam/domain/ApprovalPolicy'
import { assertCanAssign } from '@/modules/iam/domain/OrgChart'
import { NotFound } from '@/shared/errors'

const hr: OrgMember = { id: 'hr', role: 'hr_admin', managerId: null }
const m1: OrgMember = { id: 'm1', role: 'manager', managerId: null }
const m2: OrgMember = { id: 'm2', role: 'manager', managerId: 'm1' }
const m3: OrgMember = { id: 'm3', role: 'manager', managerId: 'm2' }
const e1: OrgMember = { id: 'e1', role: 'employee', managerId: 'm3' }
const company = [hr, m1, m2, m3, e1]

describe('assertCanAssign', () => {
  it('accepte un rattachement valide et le détachement', () => {
    expect(() => assertCanAssign('e1', 'm1', company)).not.toThrow()
    expect(() => assertCanAssign('e1', null, company)).not.toThrow()
  })

  it.each([
    ['cible absente de l’entreprise', 'inconnu'],
    ['cible RH', 'hr'],
  ])('404 : %s', (_label, targetId) => {
    expect(() => assertCanAssign(targetId, 'm1', company)).toThrow(NotFound)
  })

  it.each<[string, string, string]>([
    ['auto-rattachement', 'm1', 'm1'],
    ['manager inconnu ou d’une autre entreprise (F5)', 'e1', 'ailleurs'],
    ['le manager choisi est un employé', 'm1', 'e1'],
    ['le manager choisi est RH', 'e1', 'hr'],
    ['cycle direct (F30)', 'm2', 'm3'],
    ['cycle long (F30)', 'm1', 'm3'],
  ])('409 Invalid manager : %s', (_label, targetId, managerId) => {
    expect(() => assertCanAssign(targetId, managerId, company)).toThrow(InvalidManager)
  })
})
