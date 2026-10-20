import { describe, expect, it } from 'vitest'
import { PgExpensesUnitOfWork } from '@/modules/expenses/infrastructure/PgExpensesUnitOfWork'
import type { Actor } from '@/shared/actor'
import { testDb } from '../../support/db'
import { createNote, createOrg, findNote, type UserRow } from '../../support/factories'

const uow = new PgExpensesUnitOfWork()

function actorOf(user: UserRow): Actor {
  return { id: user.id, companyId: user.company_id, role: user.role, managerId: user.manager_id }
}

describe('PgNoteRepository', () => {
  it('insère avec le numéro réservé, relit, et ne voit que son entreprise', async () => {
    const a = await createOrg()
    const b = await createOrg()
    const noteB = await createNote({ user: b.employee })
    const actor = actorOf(a.employee)
    const seq = await uow.run(actor, (ctx) => ctx.notes.nextReceiptSeq())
    const note = await uow.run(actor, (ctx) =>
      ctx.notes.insert({
        userId: actor.id,
        companyId: actor.companyId,
        amount: 12.5,
        expenseDate: '2026-10-08',
        description: 'Taxi',
        receiptSeq: seq,
        receiptKey: `receipts/${seq}.png`,
      })
    )
    expect(note.toDto()).toMatchObject({ amount: 12.5, receiptKey: `receipts/${seq}.png`, status: 'pending' })
    expect((await findNote(note.id))?.receipt_seq).toBe(seq)
    expect((await uow.run(actor, (ctx) => ctx.notes.listByOwner(actor.id, 'created_at DESC'))).map((n) => n.id)).toEqual([note.id])
    expect(await uow.run(actor, (ctx) => ctx.notes.findById(noteB.id))).toBeNull()
  })

  it('listPending : notes en attente des auteurs donnés, plus anciennes d’abord', async () => {
    const org = await createOrg()
    const recent = await createNote({ user: org.employee, createdAt: new Date('2026-10-02T08:00:00Z') })
    const old = await createNote({ user: org.manager, createdAt: new Date('2026-10-01T08:00:00Z') })
    await createNote({ user: org.employee, status: 'approved' })
    await createNote({ user: org.hr })
    const notes = await uow.run(actorOf(org.hr), (ctx) => ctx.notes.listPending([org.employee.id, org.manager.id]))
    expect(notes.map((n) => n.id)).toEqual([old.id, recent.id])
  })

  it('saveDecision ne modifie qu’une note encore pending (F9)', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    const actor = actorOf(org.manager)
    // Lue « pending », puis décidée par quelqu'un d'autre avant notre UPDATE.
    const stale = await uow.run(actor, (ctx) => ctx.notes.findById(note.id))
    await testDb().query("UPDATE expense_notes SET status = 'rejected' WHERE id = $1", [note.id])
    expect(await uow.run(actor, (ctx) => ctx.notes.saveDecision(stale!.decide('approved')))).toBe(false)
    expect((await findNote(note.id))?.status).toBe('rejected')

    const fresh = await createNote({ user: org.employee })
    const loaded = await uow.run(actor, (ctx) => ctx.notes.findById(fresh.id))
    expect(await uow.run(actor, (ctx) => ctx.notes.saveDecision(loaded!.decide('approved')))).toBe(true)
  })
})
