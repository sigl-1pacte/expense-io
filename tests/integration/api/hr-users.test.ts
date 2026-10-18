import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/hr/users/route'
import { createCompany, createOrg, createUser } from '../../support/factories'
import { expectProblem, type UserDto, readJson } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

describe('GET /api/hr/users', () => {
  it.each<[string, Caller]>([
    ['anonyme → 401', 'anonymous'],
    ['mauvais rôle employee → 403', 'employee'],
    ['mauvais rôle manager → 403', 'manager'],
  ])('%s', async (_label, caller) => {
    actAsCaller(await createOrg(), caller)
    const response = await GET()
    await expectProblem(response, caller === 'anonymous' ? 401 : 403, 'Unauthorized')
  })

  it("liste employés et managers de l'entreprise triés par nom, sans RH ni autres entreprises", async () => {
    const company = await createCompany()
    const hr = await createUser({ company, role: 'hr_admin', name: 'Aaron RH' })
    await createUser({ company, role: 'hr_admin', name: 'Berthe RH' })
    const bruno = await createUser({ company, role: 'manager', name: 'Bruno' })
    const chloe = await createUser({ company, name: 'Chloé', manager: bruno })
    const alice = await createUser({ company, name: 'Alice' })
    await createUser({ company: await createCompany(), name: 'Alain Ailleurs' })
    actAs(hr)
    expect(await readJson<UserDto[]>(await GET())).toEqual([
      { id: alice.id, name: 'Alice', email: alice.email, role: 'employee', managerId: null },
      { id: bruno.id, name: 'Bruno', email: bruno.email, role: 'manager', managerId: null },
      { id: chloe.id, name: 'Chloé', email: chloe.email, role: 'employee', managerId: bruno.id },
    ])
  })

  it("session d'une RH supprimée → 401", async () => {
    await createOrg()
    actAsGhost('hr_admin')
    await expectProblem(await GET(), 401, 'Unauthorized')
  })
})
