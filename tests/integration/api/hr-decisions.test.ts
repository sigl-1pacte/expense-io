import { describe, expect, it } from 'vitest'
import { POST as approve } from '@/app/api/hr/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/hr/expense-notes/[id]/reject/route'
import { createNote, createOrg, createUser, findNote, type Org } from '../../support/factories'
import { NON_UUID_IDS, type NoteDto, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
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

  it.each<Caller>(['anonymous', 'employee', 'manager'])(
    '[as-is] %s → 403 (audit §3), note inchangée',
    async (caller) => {
      const org = await createOrg()
      const note = await createNote({ user: org.manager })
      actAsCaller(org, caller)
      const response = await decide(note.id)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
      expect((await findNote(note.id))?.status).toBe('pending')
    }
  )

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
      "note d'un employé sans manager",
      async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id,
    ],
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
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each(['approved', 'rejected'] as const)(
    '409 si la note est déjà %s, sans la modifier',
    async (status) => {
      const org = await createOrg()
      const note = await createNote({ user: org.manager, status })
      actAs(org.hr)
      const response = await decide(note.id)
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: 'Already decided' })
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

  it.each(NON_UUID_IDS)(
    '[as-is] id « %s » non-UUID : erreur SQL non interceptée (promesse rejetée)',
    async (id) => {
      actAs((await createOrg()).hr)
      await expect(decide(id)).rejects.toThrow(`invalid input syntax for type uuid: "${id}"`)
    }
  )

  it("session d'une RH supprimée → 404", async () => {
    const note = await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    expect((await decide(note.id)).status).toBe(404)
  })
})
