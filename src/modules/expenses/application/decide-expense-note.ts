import type { Actor } from '@/shared/actor'
import { NotFound } from '@/shared/errors'
import { logger } from '@/shared/logger'
import { AlreadyDecided } from '../domain/errors'
import type { Decision, ExpenseNoteDto } from '../domain/ExpenseNote'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import { decisionEmail } from './decision-email'

/**
 * Remplace les quatre handlers approve/reject. Les questions à iam
 * (`canDecide`, `contactOf`) ouvrent leur propre connexion : elles sont posées
 * hors de toute transaction, pour ne jamais tenir deux connexions du pool à la
 * fois. F9 : la garantie est l'UPDATE ... WHERE status = 'pending' ; une
 * décision concurrente perdue donne 409, comme le cas séquentiel.
 * F15 : l'e-mail de décision est écrit (outbox) dans la même transaction que
 * la décision ; si l'écriture échoue, la décision est annulée. L'envoi réel
 * est fait par le worker.
 */
export function decideExpenseNote(uow: ExpensesUnitOfWork, approvals: Approvals) {
  return async (
    actor: Actor,
    noteId: string,
    decision: Decision,
    correlationId: string,
    comment?: string
  ): Promise<ExpenseNoteDto> => {
    const note = await uow.run(actor, (ctx) => ctx.notes.findById(noteId))
    if (!note || !(await approvals.canDecide(actor, note.userId))) throw new NotFound()
    const decided = note.decide(decision, comment)
    const contact = await approvals.contactOf(actor, note.userId)
    await uow.run(actor, async (ctx) => {
      if (!(await ctx.notes.saveDecision(decided))) throw new AlreadyDecided()
      if (contact) {
        await ctx.mailer.send(
          decisionEmail(contact, { amount: decided.amount, expenseDate: decided.expenseDate, status: decision, comment: decided.decisionComment }, correlationId)
        )
      } else {
        logger.warn('Décision sans destinataire : aucun e-mail', { correlationId, noteId })
      }
    })
    return decided.toDto()
  }
}
