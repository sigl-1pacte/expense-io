import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/hr/expense-notes/route'
import { createNote, createOrg, createUser } from '../../support/factories'
import { expectProblem, type NoteDto, readJson } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

async function queueIds(): Promise<string[]> {
  return (await readJson<NoteDto[]>(await GET())).map((note) => note.id)
}

describe('GET /api/hr/expense-notes', () => {
  it.each<[string, Caller]>([
    ['anonyme → 401', 'anonymous'],
    ['mauvais rôle employee → 403', 'employee'],
    ['mauvais rôle manager → 403', 'manager'],
  ])('%s', async (_label, caller) => {
    actAsCaller(await createOrg(), caller)
    const response = await GET()
    await expectProblem(response, caller === 'anonymous' ? 401 : 403, 'Unauthorized')
  })

  it("renvoie le DTO des notes en attente des managers racine de l'entreprise, de la plus ancienne à la plus récente", async () => {
    const org = await createOrg()
    const otherRoot = await createUser({ company: org.company, role: 'manager' })
    const recent = await createNote({ user: org.manager, createdAt: new Date('2026-10-02T08:00:00Z') })
    const oldest = await createNote({
      user: otherRoot,
      amount: 75,
      expenseDate: '2026-09-29',
      description: 'Train',
      receiptKey: 'receipts/8.pdf',
      createdAt: new Date('2026-10-01T08:00:00Z'),
    })
    actAs(org.hr)
    const notes = await readJson<NoteDto[]>(await GET())
    expect(notes.map((note) => note.id)).toEqual([oldest.id, recent.id])
    expect(notes[0]).toEqual({
      id: oldest.id,
      userId: otherRoot.id,
      amount: 75,
      expenseDate: '2026-09-29',
      description: 'Train',
      receiptKey: 'receipts/8.pdf',
      status: 'pending',
      createdAt: '2026-10-01T08:00:00.000Z',
    })
  })

  it('exclut employés, managers rattachés, notes décidées, notes RH et autres entreprises', async () => {
    const org = await createOrg()
    const expected = await createNote({ user: org.manager })
    await createNote({ user: org.manager, status: 'approved' })
    await createNote({ user: org.manager, status: 'rejected' })
    await createNote({ user: org.employee })
    await createNote({ user: await createUser({ company: org.company }) })
    await createNote({
      user: await createUser({ company: org.company, role: 'manager', manager: org.manager }),
    })
    await createNote({ user: org.hr })
    await createNote({ user: (await createOrg()).manager })
    actAs(org.hr)
    expect(await queueIds()).toEqual([expected.id])
  })

  it("session d'une RH supprimée : file vide", async () => {
    await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    expect(await queueIds()).toEqual([])
  })
})
