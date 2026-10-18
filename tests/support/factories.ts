import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { testDb } from './db'

export type Role = 'employee' | 'manager' | 'hr_admin'
export type NoteStatus = 'pending' | 'approved' | 'rejected'

export interface CompanyRow {
  id: string
  name: string
  email_domain: string
}

export interface UserRow {
  id: string
  company_id: string
  name: string
  email: string
  role: Role
  manager_id: string | null
}

export interface NoteRow {
  id: string
  receipt_seq: number
  user_id: string
  company_id: string
  amount: string
  expense_date: string
  description: string
  receipt_key: string
  status: NoteStatus
  created_at: Date
}

/** Entreprise type : une RH, un manager racine, un employé rattaché à ce manager. */
export interface Org {
  company: CompanyRow
  hr: UserRow
  manager: UserRow
  employee: UserRow
}

/** Mot de passe de tous les comptes créés par les factories (login réel en E2E). */
export const TEST_PASSWORD = 'motdepasse-test'
// Coût 4 au lieu de 12 : bcrypt.compare accepte tout coût, et on évite
// ~250 ms par utilisateur créé.
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4)

const USER_COLUMNS = 'id, company_id, name, email, role, manager_id'
const NOTE_COLUMNS = `id, receipt_seq, user_id, company_id, amount, expense_date::text AS expense_date,
  description, receipt_key, status, created_at`

export function uniqueId(): string {
  return randomUUID().slice(0, 8)
}

export async function createCompany(options: { domain?: string } = {}): Promise<CompanyRow> {
  const domain = options.domain ?? `societe-${uniqueId()}.test`
  const { rows } = await testDb().query<CompanyRow>(
    'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id, name, email_domain',
    [domain.split('.')[0], domain]
  )
  return rows[0]
}

export async function createUser(options: {
  company: CompanyRow
  role?: Role
  manager?: Pick<UserRow, 'id'> | null
  name?: string
  email?: string
}): Promise<UserRow> {
  const role = options.role ?? 'employee'
  const { rows } = await testDb().query<UserRow>(
    `INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${USER_COLUMNS}`,
    [
      options.company.id,
      options.name ?? `${role}-${uniqueId()}`,
      options.email ?? `${role}-${uniqueId()}@${options.company.email_domain}`,
      TEST_PASSWORD_HASH,
      role,
      options.manager?.id ?? null,
    ]
  )
  return rows[0]
}

export async function createNote(options: {
  user: Pick<UserRow, 'id'>
  amount?: number
  expenseDate?: string
  description?: string
  status?: NoteStatus
  receiptKey?: string
  createdAt?: Date
}): Promise<NoteRow> {
  const { rows } = await testDb().query<NoteRow>(
    `INSERT INTO expense_notes
       (user_id, company_id, amount, expense_date, description, receipt_key, status, created_at)
     SELECT $1, u.company_id, $2, $3, $4, $5, $6, COALESCE($7, now())
     FROM users u WHERE u.id = $1
     RETURNING ${NOTE_COLUMNS}`,
    [
      options.user.id,
      options.amount ?? 42.5,
      options.expenseDate ?? '2026-10-08',
      options.description ?? `Note ${uniqueId()}`,
      options.receiptKey ?? 'receipts/fixture.png',
      options.status ?? 'pending',
      options.createdAt ?? null,
    ]
  )
  return rows[0]
}

export async function createOrg(): Promise<Org> {
  const company = await createCompany()
  const hr = await createUser({ company, role: 'hr_admin', name: 'Rita RH' })
  const manager = await createUser({ company, role: 'manager', name: 'Marc Manager' })
  const employee = await createUser({ company, role: 'employee', manager, name: 'Emma Employée' })
  return { company, hr, manager, employee }
}

export async function findNote(id: string): Promise<NoteRow | undefined> {
  const { rows } = await testDb().query<NoteRow>(
    `SELECT ${NOTE_COLUMNS} FROM expense_notes WHERE id = $1`,
    [id]
  )
  return rows[0]
}

export async function findUser(id: string): Promise<UserRow | undefined> {
  const { rows } = await testDb().query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
    id,
  ])
  return rows[0]
}

export async function countRows(table: 'companies' | 'users' | 'expense_notes'): Promise<number> {
  const { rows } = await testDb().query<{ count: string }>(`SELECT count(*) FROM ${table}`)
  return Number(rows[0].count)
}
