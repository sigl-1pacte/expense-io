import { describe, expect, it } from 'vitest'
import { GET as myNotes } from '@/app/api/expense-notes/route'
import { GET as hrQueue } from '@/app/api/hr/expense-notes/route'
import { POST as hrApprove } from '@/app/api/hr/expense-notes/[id]/approve/route'
import { PUT as assignManager } from '@/app/api/hr/users/[id]/manager/route'
import { GET as managerQueue } from '@/app/api/manager/expense-notes/route'
import { POST as managerApprove } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { testDb } from '../support/db'
import { createNote, createOrg, createUser, type Role, type UserRow } from '../support/factories'
import { type NoteDto, jsonBody, readJson, request, routeParams } from './helpers/http'
import { actAs } from './helpers/session'

async function managerQueueOf(manager: UserRow, role: Role = manager.role): Promise<string[]> {
  actAs(manager, role)
  return (await readJson<NoteDto[]>(await managerQueue())).map((note) => note.id)
}

async function hrQueueOf(hr: UserRow): Promise<string[]> {
  actAs(hr)
  return (await readJson<NoteDto[]>(await hrQueue())).map((note) => note.id)
}

function approveAsManager(id: string) {
  return managerApprove(request(`/api/manager/expense-notes/${id}/approve`, { method: 'POST' }), routeParams(id))
}

function approveAsHr(id: string) {
  return hrApprove(request(`/api/hr/expense-notes/${id}/approve`, { method: 'POST' }), routeParams(id))
}

function assign(targetId: string, managerId: string | null) {
  return assignManager(
    jsonBody(`/api/hr/users/${targetId}/manager`, 'PUT', { managerId }),
    routeParams(targetId)
  )
}

async function statusSeenBy(user: UserRow, noteId: string): Promise<string | undefined> {
  actAs(user)
  const notes = await readJson<NoteDto[]>(await myNotes(request('/api/expense-notes')))
  return notes.find((note) => note.id === noteId)?.status
}

describe('circuit de validation', () => {
  it("note d'employé : le manager approuve, l'employé voit « approved »", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    expect(await managerQueueOf(org.manager)).toEqual([note.id])
    actAs(org.manager)
    expect((await approveAsManager(note.id)).status).toBe(200)
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await statusSeenBy(org.employee, note.id)).toBe('approved')
  })

  it('note de manager racine : la RH approuve, le manager voit « approved »', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    expect(await hrQueueOf(org.hr)).toEqual([note.id])
    actAs(org.hr)
    expect((await approveAsHr(note.id)).status).toBe(200)
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await statusSeenBy(org.manager, note.id)).toBe('approved')
  })

  it("note d'un employé sans manager : dans la file RH (F33)", async () => {
    const org = await createOrg()
    const note = await createNote({ user: await createUser({ company: org.company }) })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await hrQueueOf(org.hr)).toEqual([note.id])
  })

  it("note d'une RH : dans la file des autres RH, jamais dans la sienne (F14)", async () => {
    const org = await createOrg()
    const otherHr = await createUser({ company: org.company, role: 'hr_admin' })
    const note = await createNote({ user: org.hr })
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await hrQueueOf(otherHr)).toEqual([note.id])
  })

  it("RH seul de son entreprise : sa note est acceptée mais n'est dans aucune file (limite documentée)", async () => {
    const org = await createOrg()
    await createNote({ user: org.hr })
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await managerQueueOf(org.manager)).toEqual([])
  })

  it('consigne « manager direct » : un manager ne voit pas les subordonnés de ses subordonnés', async () => {
    const org = await createOrg()
    const sub = await createUser({ company: org.company, role: 'manager', manager: org.manager })
    const note = await createNote({ user: await createUser({ company: org.company, manager: sub }) })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await managerQueueOf(sub)).toEqual([note.id])
    actAs(org.manager)
    expect((await approveAsManager(note.id)).status).toBe(404)
  })

  it('rattacher un manager racine déplace sa note de la file RH vers celle de son nouveau manager', async () => {
    const org = await createOrg()
    const boss = await createUser({ company: org.company, role: 'manager' })
    const note = await createNote({ user: org.manager })
    expect(await hrQueueOf(org.hr)).toEqual([note.id])
    actAs(org.hr)
    expect((await assign(org.manager.id, boss.id)).status).toBe(200)
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await managerQueueOf(boss)).toEqual([note.id])
  })

  it("un manager d'une autre entreprise ne voit ni ne valide la note (F44)", async () => {
    const org = await createOrg()
    const foreignManager = (await createOrg()).manager
    const note = await createNote({ user: org.employee })
    actAs(org.hr)
    expect((await assign(org.employee.id, foreignManager.id)).status).toBe(409)
    expect(await managerQueueOf(foreignManager)).toEqual([])
    actAs(foreignManager)
    expect((await approveAsManager(note.id)).status).toBe(404)
  })
})

describe('rôle relu en base (F31)', () => {
  it('un manager rétrogradé en base perd ses droits immédiatement, même si sa session dit « manager »', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    await testDb().query("UPDATE users SET role = 'employee' WHERE id = $1", [org.manager.id])
    actAs(org.manager, 'manager')
    expect((await managerQueue()).status).toBe(403)
    expect((await approveAsManager(note.id)).status).toBe(403)
  })

  it('un employé promu en base obtient ses droits immédiatement, même si sa session dit « employee »', async () => {
    const org = await createOrg()
    await testDb().query("UPDATE users SET role = 'manager' WHERE id = $1", [org.employee.id])
    actAs(org.employee, 'employee')
    expect((await managerQueue()).status).toBe(200)
  })
})
