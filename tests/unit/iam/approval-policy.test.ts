import { describe, expect, it } from 'vitest'
import { approveesOf, approversOf, canDecide, type OrgMember } from '@/modules/iam/domain/ApprovalPolicy'

const hr1: OrgMember = { id: 'hr1', role: 'hr_admin', managerId: null }
const hr2: OrgMember = { id: 'hr2', role: 'hr_admin', managerId: null }
const root: OrgMember = { id: 'root', role: 'manager', managerId: null }
const sub: OrgMember = { id: 'sub', role: 'manager', managerId: 'root' }
const attached: OrgMember = { id: 'att', role: 'employee', managerId: 'sub' }
const loose: OrgMember = { id: 'loose', role: 'employee', managerId: null }
const company = [hr1, hr2, root, sub, attached, loose]

describe('approversOf (une ligne par cas du tableau des validateurs)', () => {
  it.each<[string, OrgMember, string[]]>([
    ['employé rattaché → son manager direct', attached, ['sub']],
    ['manager rattaché → son manager direct', sub, ['root']],
    ['manager racine → les RH', root, ['hr1', 'hr2']],
    ['employé non rattaché → les RH (F33)', loose, ['hr1', 'hr2']],
    ['RH → les autres RH, jamais lui-même (F14)', hr1, ['hr2']],
  ])('%s', (_label, owner, expected) => {
    expect(approversOf(owner, company)).toEqual(expected)
  })

  it("RH seul de son entreprise : aucun validateur (limite documentée)", () => {
    expect(approversOf(hr1, [hr1, root])).toEqual([])
  })
})

describe('canDecide', () => {
  it('le manager direct, pas son propre manager (consigne : pas de transitivité)', () => {
    expect(canDecide('sub', attached, company)).toBe(true)
    expect(canDecide('root', attached, company)).toBe(false)
  })

  it("un RH ne décide pas la note d'un employé rattaché", () => {
    expect(canDecide('hr1', attached, company)).toBe(false)
  })

  it('personne ne décide sa propre note', () => {
    for (const member of company) expect(canDecide(member.id, member, company)).toBe(false)
  })
})

describe('approveesOf', () => {
  it('un manager valide ses subordonnés directs', () => {
    expect(approveesOf('sub', company)).toEqual(['att'])
    expect(approveesOf('root', company)).toEqual(['sub'])
  })

  it('un RH valide managers racines, non rattachés et autres RH', () => {
    expect(approveesOf('hr1', company)).toEqual(['hr2', 'root', 'loose'])
  })
})
