// API publique du module expenses.
import { iam } from '@/modules/iam'
import { decideExpenseNote } from './application/decide-expense-note'
import { getReceiptUrl } from './application/get-receipt-url'
import { listMyExpenseNotes } from './application/list-my-expense-notes'
import { listPendingApprovals } from './application/list-pending-approvals'
import { submitExpenseNote } from './application/submit-expense-note'
import { PgExpensesUnitOfWork } from './infrastructure/PgExpensesUnitOfWork'
import { S3ReceiptStorage } from './infrastructure/S3ReceiptStorage'
import type { Approvals } from './ports/Approvals'

export { MAX_RECEIPT_BYTES, parseSubmission } from './domain/Submission'
export type { ReceiptFile, Submission } from './domain/Submission'
export type { Decision, ExpenseNoteDto } from './domain/ExpenseNote'

const uow = new PgExpensesUnitOfWork()
const storage = new S3ReceiptStorage()
// D4 : expenses ne lit jamais l'organigramme ; il le demande à iam.
const approvals: Approvals = { approveesOf: iam.approveesOf, canDecide: iam.canDecide }

export const expenses = {
  submitExpenseNote: submitExpenseNote(uow, storage),
  listMyExpenseNotes: listMyExpenseNotes(uow),
  getReceiptUrl: getReceiptUrl(uow, approvals, storage),
  listPendingApprovals: listPendingApprovals(uow, approvals),
  decideExpenseNote: decideExpenseNote(uow, approvals),
}
