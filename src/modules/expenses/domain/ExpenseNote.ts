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

  decide(decision: Decision): ExpenseNote {
    if (this.props.status !== 'pending') throw new AlreadyDecided()
    return new ExpenseNote({ ...this.props, status: decision })
  }

  toDto(): ExpenseNoteDto {
    const { id, userId, amount, expenseDate, description, receiptKey, status, createdAt } = this.props
    return { id, userId, amount, expenseDate, description, receiptKey, status, createdAt: createdAt.toISOString() }
  }
}
