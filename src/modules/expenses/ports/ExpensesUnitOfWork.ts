import type { Actor } from '@/shared/actor'
import type { Mailer } from '@/shared/mail/Mailer'
import type { NoteRepository } from './NoteRepository'

export interface ExpensesContext {
  notes: NoteRepository
  mailer: Mailer
}

/** Une transaction scopée à l'acteur : tout ce que fait `fn` est écrit ensemble, ou pas du tout. */
export interface ExpensesUnitOfWork {
  run<T>(actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T>
}
