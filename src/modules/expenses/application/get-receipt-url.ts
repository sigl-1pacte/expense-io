import type { Actor } from '@/shared/actor'
import { NotFound } from '@/shared/errors'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import type { ReceiptStorage } from '../ports/ReceiptStorage'

/** F1 : l'auteur, ou un validateur au sens d'ApprovalPolicy ; sinon 404 sans révéler la note. */
export function getReceiptUrl(uow: ExpensesUnitOfWork, approvals: Approvals, storage: ReceiptStorage) {
  return async (actor: Actor, noteId: string, as: 'author' | 'approver'): Promise<string> => {
    const note = await uow.run(actor, (ctx) => ctx.notes.findById(noteId))
    if (!note) throw new NotFound()
    const allowed = as === 'author' ? note.userId === actor.id : await approvals.canDecide(actor, note.userId)
    // F39 : une clé vide signerait la racine du bucket.
    if (!allowed || note.receiptKey === '') throw new NotFound()
    return storage.signedUrl(note.receiptKey)
  }
}
