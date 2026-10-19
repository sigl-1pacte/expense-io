import type { ExpenseNote } from '../domain/ExpenseNote'

export interface NewNote {
  userId: string
  companyId: string
  amount: number
  expenseDate: string
  description: string
  receiptSeq: number
  receiptKey: string
}

/** Notes visibles dans la portée de la transaction (entreprise de l'acteur). */
export interface NoteRepository {
  /** `sort` vient toujours de `parseNoteSort` (liste blanche, F3). */
  listByOwner(ownerId: string, sort: string): Promise<ExpenseNote[]>
  /** Notes `pending` de ces auteurs, de la plus ancienne à la plus récente. */
  listPending(ownerIds: string[]): Promise<ExpenseNote[]>
  findById(id: string): Promise<ExpenseNote | null>
  nextReceiptSeq(): Promise<number>
  insert(note: NewNote): Promise<ExpenseNote>
  /** Applique la décision seulement si la note est encore `pending` ; `false` sinon (F9). */
  saveDecision(note: ExpenseNote): Promise<boolean>
}
