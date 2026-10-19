import type { Actor } from '@/shared/actor'
import type { ExpenseNoteDto } from '../domain/ExpenseNote'
import { parseNoteSort } from '../domain/NoteSort'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'

export function listMyExpenseNotes(uow: ExpensesUnitOfWork) {
  return async (actor: Actor, rawSort: string | null): Promise<ExpenseNoteDto[]> => {
    const notes = await uow.run(actor, (ctx) => ctx.notes.listByOwner(actor.id, parseNoteSort(rawSort)))
    return notes.map((note) => note.toDto())
  }
}
