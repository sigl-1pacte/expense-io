import type { Actor } from '@/shared/actor'
import { NotFound } from '@/shared/errors'
import { AlreadyDecided } from '../domain/errors'
import type { Decision, ExpenseNoteDto } from '../domain/ExpenseNote'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'

/**
 * Remplace les quatre handlers approve/reject. La question à iam (`canDecide`,
 * qui ouvre sa propre connexion) est posée hors de toute transaction, pour ne
 * jamais tenir deux connexions du pool à la fois. F9 : la garantie est
 * l'UPDATE ... WHERE status = 'pending' ; une décision concurrente perdue
 * donne 409, comme le cas séquentiel.
 */
export function decideExpenseNote(uow: ExpensesUnitOfWork, approvals: Approvals) {
  return async (actor: Actor, noteId: string, decision: Decision): Promise<ExpenseNoteDto> => {
    const note = await uow.run(actor, (ctx) => ctx.notes.findById(noteId))
    if (!note || !(await approvals.canDecide(actor, note.userId))) throw new NotFound()
    const decided = note.decide(decision)
    if (!(await uow.run(actor, (ctx) => ctx.notes.saveDecision(decided)))) throw new AlreadyDecided()
    return decided.toDto()
  }
}
