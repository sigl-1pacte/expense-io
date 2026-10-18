import { describe, expect, it } from 'vitest'
import { PUT } from '@/app/api/hr/users/[id]/manager/route'
import { createOrg, createUser, findUser, type Org } from '../../support/factories'
import {
  NON_UUID_IDS,
  expectProblem,
  UNKNOWN_ID,
  type UserDto,
  jsonBody,
  readJson,
  request,
  routeParams,
} from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function assign(targetId: string, payload: unknown) {
  return PUT(jsonBody(`/api/hr/users/${targetId}/manager`, 'PUT', payload), routeParams(targetId))
}

function assignRaw(targetId: string, init: RequestInit) {
  return PUT(request(`/api/hr/users/${targetId}/manager`, { method: 'PUT', ...init }), routeParams(targetId))
}

async function managerIdOf(userId: string): Promise<string | null | undefined> {
  return (await findUser(userId))?.manager_id
}

const MULTIPART_BODY = new FormData()
MULTIPART_BODY.set('managerId', 'ignoré')
const JSON_HEADERS = { 'content-type': 'application/json' }

describe('PUT /api/hr/users/:id/manager', () => {
  it.each<[string, Caller]>([
    ['anonyme → 401, rattachement inchangé', 'anonymous'],
    ['mauvais rôle employee → 403, rattachement inchangé', 'employee'],
    ['mauvais rôle manager → 403, rattachement inchangé', 'manager'],
  ])('%s', async (_label, caller) => {
    const org = await createOrg()
    const newcomer = await createUser({ company: org.company })
    actAsCaller(org, caller)
    const response = await assign(newcomer.id, { managerId: org.manager.id })
    await expectProblem(response, caller === 'anonymous' ? 401 : 403, 'Unauthorized')
    expect(await managerIdOf(newcomer.id)).toBeNull()
  })

  it('rattache un employé sans manager et renvoie son DTO', async () => {
    const org = await createOrg()
    const newcomer = await createUser({ company: org.company, name: 'Paul' })
    actAs(org.hr)
    const response = await assign(newcomer.id, { managerId: org.manager.id })
    expect(response.status).toBe(200)
    expect(await readJson<UserDto>(response)).toEqual({
      id: newcomer.id,
      name: 'Paul',
      email: newcomer.email,
      role: 'employee',
      managerId: org.manager.id,
    })
    expect(await managerIdOf(newcomer.id)).toBe(org.manager.id)
  })

  it('change de manager', async () => {
    const org = await createOrg()
    const other = await createUser({ company: org.company, role: 'manager' })
    actAs(org.hr)
    expect((await assign(org.employee.id, { managerId: other.id })).status).toBe(200)
    expect(await managerIdOf(org.employee.id)).toBe(other.id)
  })

  it('détache avec managerId null', async () => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assign(org.employee.id, { managerId: null })
    expect(response.status).toBe(200)
    expect((await readJson<UserDto>(response)).managerId).toBeNull()
    expect(await managerIdOf(org.employee.id)).toBeNull()
  })

  it('rattache un manager à un autre manager', async () => {
    const org = await createOrg()
    const boss = await createUser({ company: org.company, role: 'manager' })
    actAs(org.hr)
    const response = await assign(org.manager.id, { managerId: boss.id })
    expect(response.status).toBe(200)
    expect(await readJson<UserDto>(response)).toMatchObject({ role: 'manager', managerId: boss.id })
  })

  it.each<[string, (org: Org) => Promise<string>]>([
    ["cible d'une autre entreprise", async () => (await createOrg()).employee.id],
    ['cible RH (soi-même)', async (org) => org.hr.id],
    [
      'cible RH de la même entreprise',
      async (org) => (await createUser({ company: org.company, role: 'hr_admin' })).id,
    ],
    ['cible inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, targetFor) => {
    const org = await createOrg()
    const targetId = await targetFor(org)
    actAs(org.hr)
    const response = await assign(targetId, { managerId: org.manager.id })
    await expectProblem(response, 404, 'Not found')
  })

  it.each<[string, (org: Org) => Promise<[string, string]>]>([
    ['auto-rattachement', async (org) => [org.manager.id, org.manager.id]],
    [
      'le manager choisi est un employé',
      async (org) => [org.employee.id, (await createUser({ company: org.company })).id],
    ],
    ['le manager choisi est RH', async (org) => [org.employee.id, org.hr.id]],
    ['le manager choisi est inconnu', async (org) => [org.employee.id, UNKNOWN_ID]],
  ])('409 « Invalid manager » : %s', async (_label, pairFor) => {
    const org = await createOrg()
    const [targetId, managerId] = await pairFor(org)
    const before = await managerIdOf(targetId)
    actAs(org.hr)
    const response = await assign(targetId, { managerId })
    await expectProblem(response, 409, 'Invalid manager')
    expect(await managerIdOf(targetId)).toBe(before)
  })

  it("[as-is] accepte un manager d'une autre entreprise (audit §3)", async () => {
    const org = await createOrg()
    const foreign = (await createOrg()).manager
    actAs(org.hr)
    expect((await assign(org.employee.id, { managerId: foreign.id })).status).toBe(200)
    expect(await managerIdOf(org.employee.id)).toBe(foreign.id)
  })

  it.each<[string, RequestInit]>([
    ['corps non JSON', { body: 'pas du json', headers: JSON_HEADERS }],
    ['corps vide', {}],
    ['objet sans managerId', { body: '{}', headers: JSON_HEADERS }],
    ['formulaire multipart', { body: MULTIPART_BODY }],
  ])('%s → 400, rattachement inchangé', async (_label, init) => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assignRaw(org.employee.id, init)
    await expectProblem(response, 400, 'Corps de requête invalide')
    expect(await managerIdOf(org.employee.id)).toBe(org.manager.id)
  })

  it.each<unknown>([42, ''])('managerId %j de mauvais type → 400', async (managerId) => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assign(org.employee.id, { managerId })
    await expectProblem(response, 400, 'Corps de requête invalide')
  })

  it('[as-is] accepte un cycle entre deux managers', async () => {
    const org = await createOrg()
    const other = await createUser({ company: org.company, role: 'manager' })
    actAs(org.hr)
    expect((await assign(org.manager.id, { managerId: other.id })).status).toBe(200)
    expect((await assign(other.id, { managerId: org.manager.id })).status).toBe(200)
    expect(await managerIdOf(org.manager.id)).toBe(other.id)
    expect(await managerIdOf(other.id)).toBe(org.manager.id)
  })

  it.each(NON_UUID_IDS)('cible « %s » non-UUID → 400', async (id) => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assign(id, { managerId: org.manager.id })
    await expectProblem(response, 400, 'Identifiant invalide')
  })

  it("session d'une RH supprimée → 404", async () => {
    const org = await createOrg()
    actAsGhost('hr_admin')
    expect((await assign(org.employee.id, { managerId: null })).status).toBe(404)
    expect(await managerIdOf(org.employee.id)).toBe(org.manager.id)
  })
})
