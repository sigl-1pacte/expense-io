import type { Actor, Role } from '@/shared/actor'
import { getPool } from '@/shared/db'
import { runInScope, type Sql } from '@/shared/unit-of-work'
import type { OrgMember } from '../domain/ApprovalPolicy'
import { EmailAlreadyUsed } from '../domain/errors'
import type { Contact, Credentials, DirectoryUser, IamStore, NewAccount, OrgChart } from '../ports/IamStore'

interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  manager_id: string | null
}

function toDirectoryUser(row: UserRow): DirectoryUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as DirectoryUser['role'],
    managerId: row.manager_id,
  }
}

class PgOrgChart implements OrgChart {
  constructor(
    private readonly sql: Sql,
    private readonly companyId: string
  ) {}

  async lock(): Promise<void> {
    await this.sql.query("SELECT pg_advisory_xact_lock(hashtextextended('org:' || $1, 0))", [this.companyId])
  }

  async members(): Promise<OrgMember[]> {
    const { rows } = await this.sql.query<{ id: string; role: Role; manager_id: string | null }>(
      'SELECT id, role, manager_id FROM users WHERE company_id = $1 ORDER BY created_at, id',
      [this.companyId]
    )
    return rows.map((row) => ({ id: row.id, role: row.role, managerId: row.manager_id }))
  }

  async directory(): Promise<DirectoryUser[]> {
    const { rows } = await this.sql.query<UserRow>(
      `SELECT id, name, email, role, manager_id FROM users
       WHERE role IN ('employee', 'manager') AND company_id = $1
       ORDER BY name`,
      [this.companyId]
    )
    return rows.map(toDirectoryUser)
  }

  async setManager(targetId: string, managerId: string | null): Promise<DirectoryUser> {
    const { rows } = await this.sql.query<UserRow>(
      `UPDATE users SET manager_id = $1 WHERE id = $2
       RETURNING id, name, email, role, manager_id`,
      [managerId, targetId]
    )
    return toDirectoryUser(rows[0])
  }

  async contact(userId: string): Promise<Contact | null> {
    const { rows } = await this.sql.query<{ name: string; email: string }>(
      'SELECT name, email FROM users WHERE id = $1',
      [userId]
    )
    return rows[0] ?? null
  }
}

export class PgIamStore implements IamStore {
  async findActor(userId: string): Promise<Actor | null> {
    const { rows } = await getPool().query<{ id: string; company_id: string; role: Role; manager_id: string | null }>(
      'SELECT id, company_id, role, manager_id FROM app.actor($1)',
      [userId]
    )
    const row = rows[0]
    return row ? { id: row.id, companyId: row.company_id, role: row.role, managerId: row.manager_id } : null
  }

  async credentialsFor(email: string): Promise<Credentials | null> {
    const { rows } = await getPool().query<{ id: string; email: string; password_hash: string; role: Role }>(
      'SELECT id, email, password_hash, role FROM app.credentials_for($1)',
      [email]
    )
    const row = rows[0]
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role } : null
  }

  async createAccount(account: NewAccount): Promise<void> {
    try {
      await getPool().query('SELECT * FROM app.sign_up($1, $2, $3, $4, $5)', [
        account.name,
        account.email,
        account.passwordHash,
        account.domain,
        account.companyName,
      ])
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new EmailAlreadyUsed()
      throw error
    }
  }

  withOrgChart<T>(actor: Actor, fn: (org: OrgChart) => Promise<T>): Promise<T> {
    return runInScope({ userId: actor.id, companyId: actor.companyId }, (sql) =>
      fn(new PgOrgChart(sql, actor.companyId))
    )
  }
}
