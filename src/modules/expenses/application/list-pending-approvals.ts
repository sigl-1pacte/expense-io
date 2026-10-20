import type { Actor } from '@/shared/actor'
import type { ExpenseNoteDto } from '../domain/ExpenseNote'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'

/** File de validation : notes en attente des personnes que l'acteur valide (ApprovalPolicy, via iam). */
export function listPendingApprovals(uow: ExpensesUnitOfWork, approvals: Approvals) {
  return async (actor: Actor): Promise<ExpenseNoteDto[]> => {
    const ownerIds = await approvals.approveesOf(actor)
    if (ownerIds.length === 0) return []
    const notes = await uow.run(actor, (ctx) => ctx.notes.listPending(ownerIds))
    return notes.map((note) => note.toDto())
  }
}
