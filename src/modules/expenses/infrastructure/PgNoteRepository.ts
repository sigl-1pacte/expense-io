// SQL d'expenses : uniquement expense_notes (jamais users ni companies, D4).
import type { Sql } from '@/shared/unit-of-work'
import { ExpenseNote, type NoteStatus } from '../domain/ExpenseNote'
import type { NewNote, NoteRepository } from '../ports/NoteRepository'

const COLUMNS =
  'id, user_id, company_id, amount, expense_date, description, receipt_key, status, created_at'

interface NoteRow {
  id: string
  user_id: string
  company_id: string
  amount: string
  expense_date: string
  description: string
  receipt_key: string
  status: NoteStatus
  created_at: Date
}

function toNote(row: NoteRow): ExpenseNote {
  return new ExpenseNote({
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    amount: Number.parseFloat(row.amount),
    expenseDate: row.expense_date,
    description: row.description,
    receiptKey: row.receipt_key,
    status: row.status,
    createdAt: new Date(row.created_at),
  })
}

export class PgNoteRepository implements NoteRepository {
  constructor(private readonly sql: Sql) {}

  async listByOwner(ownerId: string, sort: string): Promise<ExpenseNote[]> {
    const { rows } = await this.sql.query<NoteRow>(
      `SELECT ${COLUMNS} FROM expense_notes WHERE user_id = $1 ORDER BY ${sort}`,
      [ownerId]
    )
    return rows.map(toNote)
  }

  async listPending(ownerIds: string[]): Promise<ExpenseNote[]> {
    if (ownerIds.length === 0) return []
    const { rows } = await this.sql.query<NoteRow>(
      `SELECT ${COLUMNS} FROM expense_notes
       WHERE user_id = ANY($1::uuid[]) AND status = 'pending'
       ORDER BY created_at ASC`,
      [ownerIds]
    )
    return rows.map(toNote)
  }

  async findById(id: string): Promise<ExpenseNote | null> {
    const { rows } = await this.sql.query<NoteRow>(`SELECT ${COLUMNS} FROM expense_notes WHERE id = $1`, [id])
    return rows[0] ? toNote(rows[0]) : null
  }

  async nextReceiptSeq(): Promise<number> {
    const { rows } = await this.sql.query<{ seq: number }>(
      "SELECT nextval('expense_notes_receipt_seq_seq')::int AS seq"
    )
    return rows[0].seq
  }

  async insert(note: NewNote): Promise<ExpenseNote> {
    const { rows } = await this.sql.query<NoteRow>(
      `INSERT INTO expense_notes
         (user_id, company_id, amount, expense_date, description, receipt_seq, receipt_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [note.userId, note.companyId, note.amount, note.expenseDate, note.description, note.receiptSeq, note.receiptKey]
    )
    return toNote(rows[0])
  }

  async saveDecision(note: ExpenseNote): Promise<boolean> {
    const { rowCount } = await this.sql.query(
      `UPDATE expense_notes SET status = $2 WHERE id = $1 AND status = 'pending'`,
      [note.id, note.status]
    )
    return rowCount === 1
  }
}
