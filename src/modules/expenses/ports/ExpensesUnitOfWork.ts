import type { Actor } from '@/shared/actor'
import type { NoteRepository } from './NoteRepository'

export interface ExpensesContext {
  notes: NoteRepository
}

/** Une transaction scopée à l'acteur : tout ce que fait `fn` est écrit ensemble, ou pas du tout. */
export interface ExpensesUnitOfWork {
  run<T>(actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T>
}
