import { describe, expect, it, vi } from 'vitest'
import { POST as approve } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/manager/expense-notes/[id]/reject/route'
import { OutboxMailer } from '@/shared/mail/OutboxMailer'
import { testDb } from '../../support/db'
import { createNote, createOrg, createUser, findNote, type Org } from '../../support/factories'
import { expectProblem, NON_UUID_IDS, type NoteDto, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

describe.each([
  { action: 'approve', handler: approve, decided: 'approved' },
  { action: 'reject', handler: reject, decided: 'rejected' },
] as const)('POST /api/manager/expense-notes/:id/$action', ({ action, handler, decided }) => {
  function decide(id: string, init?: RequestInit) {
    return handler(
      request(`/api/manager/expense-notes/${id}/${action}`, { method: 'POST', ...init }),
      routeParams(id)
    )
  }

  it.each<[string, Caller]>([
    ['anonyme → 401, note inchangée', 'anonymous'],
    ['mauvais rôle employee → 403, note inchangée', 'employee'],
    ['mauvais rôle hr_admin → 403, note inchangée', 'hr_admin'],
  ])('%s', async (_label, caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAsCaller(org, caller)
    const response = await decide(note.id)
    await expectProblem(response, caller === 'anonymous' ? 401 : 403, 'Unauthorized')
    expect((await findNote(note.id))?.status).toBe('pending')
  })

  it(`note d'un rattaché → ${decided}, DTO renvoyé`, async () => {
    const org = await createOrg()
    const note = await createNote({
      user: org.employee,
      amount: 18.9,
      expenseDate: '2026-10-07',
      description: 'Déjeuner',
      receiptKey: 'receipts/3.png',
      createdAt: new Date('2026-10-07T12:00:00Z'),
    })
    actAs(org.manager)
    const response = await decide(note.id)
    expect(response.status).toBe(200)
    expect(await readJson<NoteDto>(response)).toEqual({
      id: note.id,
      userId: org.employee.id,
      amount: 18.9,
      expenseDate: '2026-10-07',
      description: 'Déjeuner',
      receiptKey: 'receipts/3.png',
      status: decided,
      createdAt: '2026-10-07T12:00:00.000Z',
    })
    expect((await findNote(note.id))?.status).toBe(decided)
  })

  it("écrit l'e-mail de décision dans mail_outbox, avec la corrélation de la requête (F15)", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    expect((await decide(note.id, { headers: { 'x-correlation-id': 'corr-e2e' } })).status).toBe(200)
    const { rows } = await testDb().query('SELECT recipient, subject, correlation_id FROM mail_outbox')
    expect(rows).toEqual([
      {
        recipient: org.employee.email,
        subject: `Votre note de frais a été ${decided === 'approved' ? 'approuvée' : 'refusée'}`,
        correlation_id: 'corr-e2e',
      },
    ])
  })

  it("si l'outbox refuse l'écriture, la décision est annulée (point de vigilance 3)", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    vi.spyOn(OutboxMailer.prototype, 'send').mockRejectedValueOnce(new Error('outbox indisponible'))
    await expectProblem(await decide(note.id), 500, 'Erreur interne')
    expect((await findNote(note.id))?.status).toBe('pending')
  })

  it('ignore le corps de la requête', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    const response = await decide(note.id, {
      body: 'pas du json',
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
  })

  it.each<[string, (org: Org) => Promise<string>]>([
    [
      'employé non rattaché',
      async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id,
    ],
    [
      "employé d'un autre manager",
      async (org) => {
        const other = await createUser({ company: org.company, role: 'manager' })
        return (await createNote({ user: await createUser({ company: org.company, manager: other }) })).id
      },
    ],
    ['sa propre note', async (org) => (await createNote({ user: org.manager })).id],
    ['note de la RH', async (org) => (await createNote({ user: org.hr })).id],
    ["note d'une autre entreprise", async () => (await createNote({ user: (await createOrg()).employee })).id],
    ['note inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.manager)
    const response = await decide(id)
    await expectProblem(response, 404, 'Not found')
  })

  it.each(['approved', 'rejected'] as const)(
    '409 si la note est déjà %s, sans la modifier',
    async (status) => {
      const org = await createOrg()
      const note = await createNote({ user: org.employee, status })
      actAs(org.manager)
      const response = await decide(note.id)
      await expectProblem(response, 409, 'Already decided')
      expect((await findNote(note.id))?.status).toBe(status)
    }
  )

  it('une deuxième décision consécutive → 409', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    expect((await decide(note.id)).status).toBe(200)
    expect((await decide(note.id)).status).toBe(409)
  })

  it.each(NON_UUID_IDS)('id « %s » non-UUID → 400', async (id) => {
    actAs((await createOrg()).manager)
    await expectProblem(await decide(id), 400, 'Identifiant invalide')
  })

  it("session d'un manager supprimé → 401", async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsGhost('manager')
    await expectProblem(await decide(note.id), 401, 'Unauthorized')
  })
})
