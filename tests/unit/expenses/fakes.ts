import { ExpenseNote, type ExpenseNoteProps } from '@/modules/expenses/domain/ExpenseNote'
import type { Approvals } from '@/modules/expenses/ports/Approvals'
import type { ExpensesContext, ExpensesUnitOfWork } from '@/modules/expenses/ports/ExpensesUnitOfWork'
import type { NewNote, NoteRepository } from '@/modules/expenses/ports/NoteRepository'
import type { ReceiptStorage } from '@/modules/expenses/ports/ReceiptStorage'
import type { Actor } from '@/shared/actor'
import { InMemoryMailer } from '@/shared/mail/InMemoryMailer'

export class InMemoryNotes implements NoteRepository {
  seq = 0
  notes: ExpenseNoteProps[] = []

  async listByOwner(ownerId: string): Promise<ExpenseNote[]> {
    return this.notes.filter((n) => n.userId === ownerId).map((n) => new ExpenseNote(n))
  }
  async listPending(ownerIds: string[]): Promise<ExpenseNote[]> {
    return this.notes
      .filter((n) => ownerIds.includes(n.userId) && n.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((n) => new ExpenseNote(n))
  }
  async findById(id: string): Promise<ExpenseNote | null> {
    const found = this.notes.find((n) => n.id === id)
    return found ? new ExpenseNote(found) : null
  }
  async nextReceiptSeq(): Promise<number> {
    return ++this.seq
  }
  async insert(note: NewNote): Promise<ExpenseNote> {
    const props: ExpenseNoteProps = {
      id: `n${this.notes.length + 1}`,
      userId: note.userId,
      companyId: note.companyId,
      amount: note.amount,
      expenseDate: note.expenseDate,
      description: note.description,
      receiptKey: note.receiptKey,
      status: 'pending',
      createdAt: new Date('2026-10-08T10:00:00Z'),
    }
    this.notes.push(props)
    return new ExpenseNote(props)
  }
  async saveDecision(note: ExpenseNote): Promise<boolean> {
    const stored = this.notes.find((n) => n.id === note.id)
    if (!stored || stored.status !== 'pending') return false
    stored.status = note.status
    return true
  }
}

export class FakeUow implements ExpensesUnitOfWork {
  runs = 0
  constructor(
    readonly notes = new InMemoryNotes(),
    readonly mailer = new InMemoryMailer()
  ) {}
  async run<T>(_actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T> {
    this.runs++
    return fn({ notes: this.notes, mailer: this.mailer })
  }
}

export class FakeStorage implements ReceiptStorage {
  uploaded: Array<{ key: string; contentType: string; size: number }> = []
  failNext = false
  async upload(key: string, body: Uint8Array, contentType: string): Promise<void> {
    if (this.failNext) throw new Error('S3 indisponible')
    this.uploaded.push({ key, contentType, size: body.byteLength })
  }
  async signedUrl(key: string): Promise<string> {
    return `https://s3.test/${key}`
  }
}

export class FakeApprovals implements Approvals {
  constructor(
    private readonly approvees: Record<string, string[]> = {},
    private readonly contacts: Record<string, { name: string; email: string }> = {}
  ) {}
  async approveesOf(actor: Actor): Promise<string[]> {
    return this.approvees[actor.id] ?? []
  }
  async canDecide(actor: Actor, ownerId: string): Promise<boolean> {
    return (this.approvees[actor.id] ?? []).includes(ownerId)
  }
  async contactOf(_actor: Actor, userId: string) {
    return this.contacts[userId] ?? null
  }
}

export function actor(id: string, role: Actor['role'] = 'employee'): Actor {
  return { id, companyId: 'acme', role, managerId: null }
}
