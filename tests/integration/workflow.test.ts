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

  it("[as-is] note d'un employé sans manager : dans aucune file (audit, circuit de validation)", async () => {
    const org = await createOrg()
    await createNote({ user: await createUser({ company: org.company }) })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await hrQueueOf(org.hr)).toEqual([])
  })

  it("[as-is] note d'une RH : dans aucune file (audit, circuit de validation)", async () => {
    const org = await createOrg()
    await createNote({ user: org.hr })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await hrQueueOf(org.hr)).toEqual([])
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

  it("[as-is] un manager d'une autre entreprise peut valider la note d'un employé que la RH lui a rattaché (audit §3)", async () => {
    const org = await createOrg()
    const foreignManager = (await createOrg()).manager
    const note = await createNote({ user: org.employee })
    actAs(org.hr)
    expect((await assign(org.employee.id, foreignManager.id)).status).toBe(200)
    expect(await managerQueueOf(foreignManager)).toEqual([note.id])
    actAs(foreignManager)
    expect((await approveAsManager(note.id)).status).toBe(200)
  })
})

describe('rôle figé dans la session (audit §5)', () => {
  it('[as-is] un manager rétrogradé en base garde ses droits tant que sa session dure', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    await testDb().query("UPDATE users SET role = 'employee' WHERE id = $1", [org.manager.id])
    expect(await managerQueueOf(org.manager, 'manager')).toEqual([note.id])
    actAs(org.manager, 'manager')
    expect((await approveAsManager(note.id)).status).toBe(200)
  })

  it('[as-is] un employé promu en base reste refusé tant que sa session dit « employee »', async () => {
    const org = await createOrg()
    await testDb().query("UPDATE users SET role = 'manager' WHERE id = $1", [org.employee.id])
    actAs(org.employee, 'employee')
    expect((await managerQueue()).status).toBe(401)
  })
})
