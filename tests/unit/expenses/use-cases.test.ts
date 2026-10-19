import { describe, expect, it } from 'vitest'
import { getReceiptUrl } from '@/modules/expenses/application/get-receipt-url'
import { listMyExpenseNotes } from '@/modules/expenses/application/list-my-expense-notes'
import { submitExpenseNote } from '@/modules/expenses/application/submit-expense-note'
import { ReceiptUploadFailed } from '@/modules/expenses/domain/errors'
import type { Submission } from '@/modules/expenses/domain/Submission'
import { NotFound } from '@/shared/errors'
import { FakeApprovals, FakeStorage, FakeUow, actor } from './fakes'

const submission: Submission = {
  amount: 42.5,
  expenseDate: '2026-10-08',
  description: 'Taxi',
  receipt: { name: 'recu.png', type: 'image/png', size: 3, read: async () => new Uint8Array(3) },
}

describe('submitExpenseNote (F10)', () => {
  it('réserve le numéro, envoie le reçu, puis crée la note avec sa clé', async () => {
    const uow = new FakeUow()
    const storage = new FakeStorage()
    const dto = await submitExpenseNote(uow, storage)(actor('e1'), submission)
    expect(storage.uploaded).toEqual([{ key: 'receipts/1.png', contentType: 'image/png', size: 3 }])
    expect(dto).toMatchObject({ userId: 'e1', receiptKey: 'receipts/1.png', status: 'pending', amount: 42.5 })
    expect(uow.notes.notes[0].companyId).toBe('acme')
  })

  it('échec du stockage : ReceiptUploadFailed (502) et aucune note', async () => {
    const uow = new FakeUow()
    const storage = new FakeStorage()
    storage.failNext = true
    await expect(submitExpenseNote(uow, storage)(actor('e1'), submission)).rejects.toBeInstanceOf(ReceiptUploadFailed)
    expect(uow.notes.notes).toEqual([])
  })
})

describe('listMyExpenseNotes', () => {
  it('ne renvoie que les notes de l’acteur', async () => {
    const uow = new FakeUow()
    await submitExpenseNote(uow, new FakeStorage())(actor('e1'), submission)
    await submitExpenseNote(uow, new FakeStorage())(actor('e2'), submission)
    expect((await listMyExpenseNotes(uow)(actor('e1'), null)).map((n) => n.userId)).toEqual(['e1'])
  })
})

describe('getReceiptUrl (F1, F39)', () => {
  async function withNote(receiptKey = 'receipts/1.png') {
    const uow = new FakeUow()
    await submitExpenseNote(uow, new FakeStorage())(actor('e1'), submission)
    uow.notes.notes[0].receiptKey = receiptKey
    return uow
  }

  it('auteur : URL de son reçu', async () => {
    const uow = await withNote()
    expect(await getReceiptUrl(uow, new FakeApprovals(), new FakeStorage())(actor('e1'), 'n1', 'author')).toBe(
      'https://s3.test/receipts/1.png'
    )
  })

  it('validateur : seulement s’il peut décider la note', async () => {
    const uow = await withNote()
    const approvals = new FakeApprovals({ m1: ['e1'] })
    expect(await getReceiptUrl(uow, approvals, new FakeStorage())(actor('m1', 'manager'), 'n1', 'approver')).toContain('receipts/1.png')
    await expect(getReceiptUrl(uow, approvals, new FakeStorage())(actor('m2', 'manager'), 'n1', 'approver')).rejects.toBeInstanceOf(NotFound)
  })

  it('note d’un autre, note inconnue, note sans clé : 404', async () => {
    const uow = await withNote('')
    const read = getReceiptUrl(uow, new FakeApprovals(), new FakeStorage())
    await expect(read(actor('e2'), 'n1', 'author')).rejects.toBeInstanceOf(NotFound)
    await expect(read(actor('e1'), 'inconnue', 'author')).rejects.toBeInstanceOf(NotFound)
    await expect(read(actor('e1'), 'n1', 'author')).rejects.toBeInstanceOf(NotFound)
  })
})
