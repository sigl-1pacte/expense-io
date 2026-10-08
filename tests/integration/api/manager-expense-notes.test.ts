import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/manager/expense-notes/route'
import { createCompany, createNote, createOrg, createUser } from '../../support/factories'
import { type NoteDto, readJson } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

async function queueIds(): Promise<string[]> {
  return (await readJson<NoteDto[]>(await GET())).map((note) => note.id)
}

describe('GET /api/manager/expense-notes', () => {
  it.each<Caller>(['anonymous', 'employee', 'hr_admin'])(
    '[as-is] %s → 401 et non 403 (audit §3)',
    async (caller) => {
      actAsCaller(await createOrg(), caller)
      const response = await GET()
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    }
  )

  it('renvoie le DTO des notes en attente des rattachés directs, de la plus ancienne à la plus récente', async () => {
    const org = await createOrg()
    const colleague = await createUser({ company: org.company, manager: org.manager })
    const recent = await createNote({ user: org.employee, createdAt: new Date('2026-10-03T08:00:00Z') })
    const oldest = await createNote({
      user: colleague,
      amount: 12.3,
      expenseDate: '2026-09-30',
      description: 'Parking',
      receiptKey: 'receipts/5.png',
      createdAt: new Date('2026-10-01T08:00:00Z'),
    })
    const middle = await createNote({ user: org.employee, createdAt: new Date('2026-10-02T08:00:00Z') })
    actAs(org.manager)
    const notes = await readJson<NoteDto[]>(await GET())
    expect(notes.map((note) => note.id)).toEqual([oldest.id, middle.id, recent.id])
    expect(notes[0]).toEqual({
      id: oldest.id,
      userId: colleague.id,
      amount: 12.3,
      expenseDate: '2026-09-30',
      description: 'Parking',
      receiptKey: 'receipts/5.png',
      status: 'pending',
      createdAt: '2026-10-01T08:00:00.000Z',
    })
  })

  it('exclut ses propres notes, les notes décidées et celles des non-rattachés', async () => {
    const org = await createOrg()
    const expected = await createNote({ user: org.employee })
    await createNote({ user: org.employee, status: 'approved' })
    await createNote({ user: org.employee, status: 'rejected' })
    await createNote({ user: org.manager })
    await createNote({ user: org.hr })
    await createNote({ user: await createUser({ company: org.company }) })
    const otherManager = await createUser({ company: org.company, role: 'manager' })
    await createNote({ user: await createUser({ company: org.company, manager: otherManager }) })
    actAs(org.manager)
    expect(await queueIds()).toEqual([expected.id])
  })

  it('ne voit que les rattachés directs, pas leurs propres rattachés', async () => {
    const org = await createOrg()
    const subManager = await createUser({ company: org.company, role: 'manager', manager: org.manager })
    const subNote = await createNote({ user: subManager })
    await createNote({ user: await createUser({ company: org.company, manager: subManager }) })
    actAs(org.manager)
    expect(await queueIds()).toEqual([subNote.id])
  })

  it("[as-is] voit les notes d'un rattaché d'une autre entreprise (audit §3)", async () => {
    const org = await createOrg()
    const foreign = await createUser({ company: await createCompany(), manager: org.manager })
    const note = await createNote({ user: foreign })
    actAs(org.manager)
    expect(await queueIds()).toEqual([note.id])
  })

  it("session d'un manager supprimé : file vide", async () => {
    await createNote({ user: (await createOrg()).employee })
    actAsGhost('manager')
    expect(await queueIds()).toEqual([])
  })
})
