import type { Actor } from '@/shared/actor'
import { NotFound } from '@/shared/errors'
import { AlreadyDecided } from '../domain/errors'
import type { Decision, ExpenseNoteDto } from '../domain/ExpenseNote'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'

/**
 * Remplace les quatre handlers approve/reject. F9 : l'UPDATE ne touche la
 * note que si elle est encore `pending` ; une décision concurrente perdue
 * donne 409, comme le cas séquentiel.
 */
export function decideExpenseNote(uow: ExpensesUnitOfWork, approvals: Approvals) {
  return (actor: Actor, noteId: string, decision: Decision): Promise<ExpenseNoteDto> =>
    uow.run(actor, async (ctx) => {
      const note = await ctx.notes.findById(noteId)
      if (!note || !(await approvals.canDecide(actor, note.userId))) throw new NotFound()
      const decided = note.decide(decision)
      if (!(await ctx.notes.saveDecision(decided))) throw new AlreadyDecided()
      return decided.toDto()
    })
}
