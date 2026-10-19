import type { Actor } from '@/shared/actor'
import { logger } from '@/shared/logger'
import { ReceiptUploadFailed } from '../domain/errors'
import type { ExpenseNoteDto } from '../domain/ExpenseNote'
import { receiptKeyFor, type Submission } from '../domain/Submission'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import type { ReceiptStorage } from '../ports/ReceiptStorage'

/**
 * F10 : le reçu d'abord, la note ensuite, sans transaction ouverte pendant
 * l'appel S3. Un échec de l'insertion après l'envoi laisse un objet orphelin,
 * sans risque (aucune note ne le référence) ; `npm run receipts:orphans` le nettoie.
 */
export function submitExpenseNote(uow: ExpensesUnitOfWork, storage: ReceiptStorage) {
  return async (actor: Actor, submission: Submission): Promise<ExpenseNoteDto> => {
    const receiptSeq = await uow.run(actor, (ctx) => ctx.notes.nextReceiptSeq())
    const receiptKey = receiptKeyFor(receiptSeq, submission.receipt)
    try {
      await storage.upload(receiptKey, await submission.receipt.read(), submission.receipt.type)
    } catch (error) {
      logger.error('Envoi du reçu échoué', { receiptKey, error })
      throw new ReceiptUploadFailed()
    }
    const note = await uow.run(actor, (ctx) =>
      ctx.notes.insert({
        userId: actor.id,
        companyId: actor.companyId,
        amount: submission.amount,
        expenseDate: submission.expenseDate,
        description: submission.description,
        receiptSeq,
        receiptKey,
      })
    )
    return note.toDto()
  }
}
