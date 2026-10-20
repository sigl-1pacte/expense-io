import type { Actor } from '@/shared/actor'
import { runInScope } from '@/shared/unit-of-work'
import type { ExpensesContext, ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import { PgNoteRepository } from './PgNoteRepository'

/** Tous les adapters du contexte partagent la connexion, donc la transaction. */
export class PgExpensesUnitOfWork implements ExpensesUnitOfWork {
  run<T>(actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T> {
    return runInScope({ userId: actor.id, companyId: actor.companyId }, (sql) =>
      fn({ notes: new PgNoteRepository(sql) })
    )
  }
}
