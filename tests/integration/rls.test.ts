import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { TEST_ENV } from '../support/env'
import { createNote, createOrg, createUser, type UserRow } from '../support/factories'

/** Connexion `expense_app` avec la portée de `user`, annulée à la fin. */
async function asApp<T>(user: Pick<UserRow, 'id' | 'company_id'> | null, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: TEST_ENV.APP_DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    if (user) {
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_company_id', $2, true)",
        [user.id, user.company_id]
      )
    }
    return await fn(client)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
}

describe('rôle expense_app', () => {
  it("n'est ni superutilisateur ni BYPASSRLS (F2)", async () => {
    const flags = await asApp(null, async (c) =>
      (await c.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0]
    )
    expect(flags).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it("ne peut pas lire password_hash, mais lit les autres colonnes de users", async () => {
    const { employee } = await createOrg()
    await expect(
      asApp(employee, (c) => c.query('SELECT password_hash FROM users'))
    ).rejects.toThrow('permission denied')
    const rows = await asApp(employee, async (c) => (await c.query('SELECT id, email FROM users')).rows)
    expect(rows.map((r) => r.id)).toContain(employee.id)
  })

  it("ne peut pas écrire directement dans users ni companies", async () => {
    await expect(
      asApp(null, (c) => c.query("INSERT INTO companies (name, email_domain) VALUES ('x', 'x.fr')"))
    ).rejects.toThrow('permission denied')
  })
})

describe('isolation entre entreprises (F44)', () => {
  it("un utilisateur ne voit que les notes, utilisateurs et entreprise de la sienne", async () => {
    const a = await createOrg()
    const b = await createOrg()
    const noteA = await createNote({ user: a.employee })
    await createNote({ user: b.employee })
    const seen = await asApp(a.manager, async (c) => ({
      notes: (await c.query('SELECT id FROM expense_notes')).rows.map((r) => r.id),
      users: (await c.query('SELECT company_id FROM users')).rows.map((r) => r.company_id),
      companies: (await c.query('SELECT id FROM companies')).rows.map((r) => r.id),
    }))
    expect(seen.notes).toEqual([noteA.id])
    expect(new Set(seen.users)).toEqual(new Set([a.company.id]))
    expect(seen.companies).toEqual([a.company.id])
  })

  it('sans portée, rien n’est visible (point de vigilance 1)', async () => {
    await createNote({ user: (await createOrg()).employee })
    const counts = await asApp(null, async (c) => ({
      notes: (await c.query('SELECT count(*)::int AS n FROM expense_notes')).rows[0].n,
      users: (await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n,
    }))
    expect(counts).toEqual({ notes: 0, users: 0 })
  })

  it("refuse une note au nom d'un autre utilisateur ou d'une autre entreprise", async () => {
    const a = await createOrg()
    const b = await createOrg()
    const insert = (userId: string, companyId: string) =>
      asApp(a.employee, (c) =>
        c.query(
          `INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key)
           VALUES ($1, $2, 1, '2026-10-08', 'x', 'k')`,
          [userId, companyId]
        )
      )
    await expect(insert(a.manager.id, a.company.id)).rejects.toThrow('row-level security')
    await expect(insert(a.employee.id, b.company.id)).rejects.toThrow('row-level security')
  })

  it("le company_id d'une nouvelle note vaut l'entreprise de la portée par défaut", async () => {
    const a = await createOrg()
    const companyId = await asApp(a.employee, async (c) =>
      (
        await c.query(
          `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
           VALUES ($1, 1, '2026-10-08', 'x', 'k') RETURNING company_id`,
          [a.employee.id]
        )
      ).rows[0].company_id
    )
    expect(companyId).toBe(a.company.id)
  })

  it("modifie le rattachement (manager_id) d'un utilisateur de son entreprise", async () => {
    const a = await createOrg()
    const rows = await asApp(a.hr, async (c) =>
      (await c.query('UPDATE users SET manager_id = $1 WHERE id = $2', [a.manager.id, a.employee.id])).rowCount
    )
    expect(rows).toBe(1)
  })

  it("ne peut pas modifier users.role (aucun droit de colonne)", async () => {
    const a = await createOrg()
    await expect(
      asApp(a.hr, (c) => c.query("UPDATE users SET role = 'hr_admin' WHERE id = $1", [a.employee.id]))
    ).rejects.toThrow('permission denied')
  })

  it("modifie une note de son entreprise", async () => {
    const a = await createOrg()
    const note = await createNote({ user: a.employee })
    const updated = await asApp(a.hr, async (c) =>
      (await c.query("UPDATE expense_notes SET status = 'approved' WHERE id = $1", [note.id])).rowCount
    )
    expect(updated).toBe(1)
  })

  it("ne modifie aucune note d'une autre entreprise", async () => {
    const a = await createOrg()
    const noteB = await createNote({ user: (await createOrg()).employee })
    const updated = await asApp(a.hr, async (c) =>
      (await c.query("UPDATE expense_notes SET status = 'approved' WHERE id = $1", [noteB.id])).rowCount
    )
    expect(updated).toBe(0)
  })
})

describe('fonctions SECURITY DEFINER', () => {
  it('app.actor lit un acteur hors portée', async () => {
    const { manager, company } = await createOrg()
    const actor = await asApp(null, async (c) => (await c.query('SELECT * FROM app.actor($1)', [manager.id])).rows[0])
    expect(actor).toEqual({ id: manager.id, company_id: company.id, role: 'manager', manager_id: null })
  })

  it('app.credentials_for renvoie le hash pour la connexion', async () => {
    const { employee } = await createOrg()
    const row = await asApp(null, async (c) =>
      (await c.query('SELECT id, role, password_hash FROM app.credentials_for($1)', [employee.email])).rows[0]
    )
    expect(row).toMatchObject({ id: employee.id, role: 'employee', password_hash: expect.any(String) })
  })

  it("app.sign_up : premier inscrit RH d'une nouvelle entreprise, suivants employés", async () => {
    const roles = await asApp(null, async (c) => {
      const first = (await c.query("SELECT * FROM app.sign_up('A', 'a@neuve.fr', 'h', 'neuve.fr', 'neuve')")).rows[0]
      const second = (await c.query("SELECT * FROM app.sign_up('B', 'b@neuve.fr', 'h', 'neuve.fr', 'neuve')")).rows[0]
      return [first.role, second.role]
    })
    expect(roles).toEqual(['hr_admin', 'employee'])
  })

  it('app.sign_up avec un email existant échoue en violation d’unicité (23505)', async () => {
    const { employee } = await createOrg()
    await expect(
      asApp(null, (c) =>
        c.query("SELECT * FROM app.sign_up('X', $1, 'h', 'autre.fr', 'autre')", [employee.email])
      )
    ).rejects.toMatchObject({ code: '23505' })
  })
})

describe('factories', () => {
  it("createNote renseigne company_id depuis l'auteur", async () => {
    const org = await createOrg()
    const other = await createUser({ company: org.company })
    const note = await createNote({ user: other })
    expect(note.company_id).toBe(org.company.id)
  })
})
