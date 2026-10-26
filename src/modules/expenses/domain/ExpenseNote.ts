import { AlreadyDecided } from './errors'

export type NoteStatus = 'pending' | 'approved' | 'rejected'
export type Decision = 'approved' | 'rejected'

export interface ExpenseNoteProps {
  id: string
  userId: string
  companyId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: NoteStatus
  decisionComment?: string
  createdAt: Date
}

/** Représentation HTTP, inchangée depuis la version 0.1.0 du contrat. */
export interface ExpenseNoteDto {
  id: string
  userId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: NoteStatus
  /** Absent quand le validateur n'a rien écrit (jamais `null`). */
  decisionComment?: string
  createdAt: string
}

/** Agrégat : une note ne quitte `pending` qu'une fois. */
export class ExpenseNote {
  constructor(private readonly props: ExpenseNoteProps) {}

  get id(): string {
    return this.props.id
  }

  get userId(): string {
    return this.props.userId
  }

  get status(): NoteStatus {
    return this.props.status
  }

  get receiptKey(): string {
    return this.props.receiptKey
  }

  get amount(): number {
    return this.props.amount
  }

  get expenseDate(): string {
    return this.props.expenseDate
  }

  get decisionComment(): string | undefined {
    return this.props.decisionComment
  }

  decide(decision: Decision, comment?: string): ExpenseNote {
    if (this.props.status !== 'pending') throw new AlreadyDecided()
    return new ExpenseNote({ ...this.props, status: decision, decisionComment: comment })
  }

  toDto(): ExpenseNoteDto {
    const { id, userId, amount, expenseDate, description, receiptKey, status, decisionComment, createdAt } = this.props
    return {
      id,
      userId,
      amount,
      expenseDate,
      description,
      receiptKey,
      status,
      ...(decisionComment ? { decisionComment } : {}),
      createdAt: createdAt.toISOString(),
    }
  }
}
