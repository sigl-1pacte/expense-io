import { describe, expect, it } from 'vitest'
import { POST as approve } from '@/app/api/hr/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/hr/expense-notes/[id]/reject/route'
import { createNote, createOrg, createUser, findNote, type Org } from '../../support/factories'
import { expectProblem, NON_UUID_IDS, type NoteDto, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

describe.each([
  { action: 'approve', handler: approve, decided: 'approved' },
  { action: 'reject', handler: reject, decided: 'rejected' },
] as const)('POST /api/hr/expense-notes/:id/$action', ({ action, handler, decided }) => {
  function decide(id: string, init?: RequestInit) {
    return handler(
      request(`/api/hr/expense-notes/${id}/${action}`, { method: 'POST', ...init }),
      routeParams(id)
    )
  }

  it.each<[string, Caller]>([
    ['anonyme → 401, note inchangée', 'anonymous'],
    ['mauvais rôle employee → 403, note inchangée', 'employee'],
    ['mauvais rôle manager → 403, note inchangée', 'manager'],
  ])('%s', async (_label, caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAsCaller(org, caller)
    const response = await decide(note.id)
    await expectProblem(response, caller === 'anonymous' ? 401 : 403, 'Unauthorized')
    expect((await findNote(note.id))?.status).toBe('pending')
  })

  it(`note d'un manager racine → ${decided}, DTO renvoyé`, async () => {
    const org = await createOrg()
    const note = await createNote({
      user: org.manager,
      amount: 75,
      expenseDate: '2026-10-05',
      description: 'Train',
      receiptKey: 'receipts/4.pdf',
      createdAt: new Date('2026-10-05T09:00:00Z'),
    })
    actAs(org.hr)
    const response = await decide(note.id)
    expect(response.status).toBe(200)
    expect(await readJson<NoteDto>(response)).toEqual({
      id: note.id,
      userId: org.manager.id,
      amount: 75,
      expenseDate: '2026-10-05',
      description: 'Train',
      receiptKey: 'receipts/4.pdf',
      status: decided,
      createdAt: '2026-10-05T09:00:00.000Z',
    })
    expect((await findNote(note.id))?.status).toBe(decided)
  })

  it('ignore le corps de la requête', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAs(org.hr)
    const response = await decide(note.id, {
      body: 'pas du json',
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
  })

  it.each<[string, (org: Org) => Promise<string>]>([
    ["note d'un employé rattaché", async (org) => (await createNote({ user: org.employee })).id],
    [
      "note d'un manager rattaché",
      async (org) =>
        (
          await createNote({
            user: await createUser({ company: org.company, role: 'manager', manager: org.manager }),
          })
        ).id,
    ],
    ['sa propre note', async (org) => (await createNote({ user: org.hr })).id],
    [
      "manager racine d'une autre entreprise",
      async () => (await createNote({ user: (await createOrg()).manager })).id,
    ],
    ['note inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.hr)
    const response = await decide(id)
    await expectProblem(response, 404, 'Not found')
  })

  it.each<[string, (org: Org) => Promise<string>]>([
    ["note d'un employé sans manager (F33)", async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id],
    ["note d'une autre RH (F14)", async (org) => (await createNote({ user: await createUser({ company: org.company, role: 'hr_admin' }) })).id],
  ])('la RH décide : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.hr)
    expect((await decide(id)).status).toBe(200)
  })

  it.each(['approved', 'rejected'] as const)(
    '409 si la note est déjà %s, sans la modifier',
    async (status) => {
      const org = await createOrg()
      const note = await createNote({ user: org.manager, status })
      actAs(org.hr)
      const response = await decide(note.id)
      await expectProblem(response, 409, 'Already decided')
      expect((await findNote(note.id))?.status).toBe(status)
    }
  )

  it('une deuxième décision consécutive → 409', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAs(org.hr)
    expect((await decide(note.id)).status).toBe(200)
    expect((await decide(note.id)).status).toBe(409)
  })

  it.each(NON_UUID_IDS)('id « %s » non-UUID → 400', async (id) => {
    actAs((await createOrg()).hr)
    await expectProblem(await decide(id), 400, 'Identifiant invalide')
  })

  it("session d'une RH supprimée → 401", async () => {
    const note = await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    await expectProblem(await decide(note.id), 401, 'Unauthorized')
  })
})
