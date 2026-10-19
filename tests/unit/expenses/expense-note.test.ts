import { describe, expect, it } from 'vitest'
import { ExpenseNote, type ExpenseNoteProps } from '@/modules/expenses/domain/ExpenseNote'
import { AlreadyDecided } from '@/modules/expenses/domain/errors'

const props: ExpenseNoteProps = {
  id: 'n1',
  userId: 'u1',
  companyId: 'c1',
  amount: 42.5,
  expenseDate: '2026-10-08',
  description: 'Taxi',
  receiptKey: 'receipts/1.png',
  status: 'pending',
  createdAt: new Date('2026-10-08T10:00:00.000Z'),
}

describe('ExpenseNote', () => {
  it.each(['approved', 'rejected'] as const)('pending → %s', (decision) => {
    const decided = new ExpenseNote(props).decide(decision)
    expect(decided.status).toBe(decision)
  })

  it.each(['approved', 'rejected'] as const)('une note %s ne se décide plus (F9)', (status) => {
    expect(() => new ExpenseNote({ ...props, status }).decide('approved')).toThrow(AlreadyDecided)
  })

  it('expose les propriétés de la note', () => {
    const note = new ExpenseNote(props)
    expect([note.id, note.userId, note.amount, note.expenseDate, note.receiptKey]).toEqual([
      'n1',
      'u1',
      42.5,
      '2026-10-08',
      'receipts/1.png',
    ])
  })

  it('toDto : contrat HTTP historique', () => {
    expect(new ExpenseNote(props).toDto()).toEqual({
      id: 'n1',
      userId: 'u1',
      amount: 42.5,
      expenseDate: '2026-10-08',
      description: 'Taxi',
      receiptKey: 'receipts/1.png',
      status: 'pending',
      createdAt: '2026-10-08T10:00:00.000Z',
    })
  })
})
