import { describe, expect, it } from 'vitest'
import { InvalidManager } from '@/modules/iam/domain/errors'
import { iam } from '@/modules/iam'
import { createOrg, createUser, findUser } from '../../support/factories'

describe('iam sur Postgres', () => {
  it('getActor lit rôle, entreprise et manager', async () => {
    const { employee, manager, company } = await createOrg()
    expect(await iam.getActor(employee.id)).toEqual({
      id: employee.id,
      companyId: company.id,
      role: 'employee',
      managerId: manager.id,
    })
  })

  it("approveesOf d'un RH : managers racines, non rattachés, autres RH", async () => {
    const org = await createOrg()
    const loose = await createUser({ company: org.company })
    const otherHr = await createUser({ company: org.company, role: 'hr_admin' })
    await createOrg()
    const hr = await iam.getActor(org.hr.id)
    expect(new Set(await iam.approveesOf(hr))).toEqual(new Set([org.manager.id, loose.id, otherHr.id]))
  })

  it('getContact dans la portée RLS du manager', async () => {
    const org = await createOrg()
    expect(await iam.getContact(await iam.getActor(org.manager.id), org.employee.id)).toEqual({
      name: org.employee.name,
      email: org.employee.email,
    })
  })

  it('F30 en concurrence : « M1 → M2 » et « M2 → M1 » simultanés donnent un succès et un refus', async () => {
    const org = await createOrg()
    const m2 = await createUser({ company: org.company, role: 'manager' })
    const hr = await iam.getActor(org.hr.id)
    const results = await Promise.allSettled([
      iam.assignManager(hr, org.manager.id, m2.id),
      iam.assignManager(hr, m2.id, org.manager.id),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(InvalidManager) })
    const managers = [(await findUser(org.manager.id))?.manager_id, (await findUser(m2.id))?.manager_id]
    expect(managers.filter((id) => id !== null)).toHaveLength(1)
  })

  it('F30 en concurrence : trois rattachements qui fermeraient une boucle donnent au moins un refus', async () => {
    const org = await createOrg()
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => createUser({ company: org.company, role: 'manager' })))
    const hr = await iam.getActor(org.hr.id)
    const results = await Promise.allSettled([
      iam.assignManager(hr, a.id, b.id),
      iam.assignManager(hr, b.id, c.id),
      iam.assignManager(hr, c.id, a.id),
    ])
    expect(results.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(1)
  })

  it("signUp refuse un email existant, même en concurrence (F12)", async () => {
    const results = await Promise.all([
      iam.signUp({ name: 'A', email: 'dup@neuve.fr', password: 'motdepasse' }),
      iam.signUp({ name: 'B', email: 'dup@neuve.fr', password: 'motdepasse' }),
    ])
    expect(results).toContainEqual({ ok: true })
    expect(results).toContainEqual({ ok: false, error: 'Un compte existe déjà avec cet email.' })
  })

  it('authenticate : identifiants valides, mauvais mot de passe, email inconnu', async () => {
    await iam.signUp({ name: 'Auth', email: 'auth@credentials.fr', password: 'motdepasse' })
    expect(await iam.authenticate('auth@credentials.fr', 'motdepasse')).toMatchObject({
      email: 'auth@credentials.fr',
      role: 'hr_admin',
    })
    expect(await iam.authenticate('auth@credentials.fr', 'mauvais')).toBeNull()
    expect(await iam.authenticate('inconnu@credentials.fr', 'motdepasse')).toBeNull()
  })
})
