import { describe, expect, it, vi } from 'vitest'
import { getPool } from '@/shared/db'
import { runInScope } from '@/shared/unit-of-work'
import { countRows, createNote, createOrg } from '../../support/factories'

const SCOPE = `SELECT current_setting('app.current_user_id', true) AS user_id,
                      current_setting('app.current_company_id', true) AS company_id`

describe('runInScope', () => {
  it("expose l'utilisateur et son entreprise aux policies pendant la transaction", async () => {
    const { employee, company } = await createOrg()
    const scope = await runInScope({ userId: employee.id, companyId: company.id }, async (client) => (await client.query(SCOPE)).rows[0])
    expect(scope).toEqual({ user_id: employee.id, company_id: company.id })
  })

  it('ne laisse ni utilisateur ni entreprise sur la connexion rendue au pool (point de vigilance 5)', async () => {
    const { employee, company } = await createOrg()
    await runInScope({ userId: employee.id, companyId: company.id }, async () => undefined)
    const client = await getPool().connect()
    try {
      const { rows } = await client.query(SCOPE)
      expect([rows[0].user_id ?? '', rows[0].company_id ?? '']).toEqual(['', ''])
    } finally {
      client.release()
    }
  })

  it('valide la transaction et renvoie le résultat de la fonction', async () => {
    const { employee, company } = await createOrg()
    const result = await runInScope({ userId: employee.id, companyId: company.id }, async (client) => {
      await client.query(
        `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
         VALUES ($1, 1, '2026-10-08', 'commit', 'k')`,
        [employee.id]
      )
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(await countRows('expense_notes')).toBe(1)
  })

  it("annule la transaction et relance l'erreur", async () => {
    const { employee, company } = await createOrg()
    await expect(
      runInScope({ userId: employee.id, companyId: company.id }, async (client) => {
        await client.query(
          `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
           VALUES ($1, 1, '2026-10-08', 'rollback', 'k')`,
          [employee.id]
        )
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(await countRows('expense_notes')).toBe(0)
  })
})

describe('Row Level Security', () => {
  it("n'avertit pas d'un contournement de la RLS avec le rôle de test (expense_app)", async () => {
    vi.resetModules()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runInScope: fresh } = await import('@/shared/unit-of-work')
    const { employee, company } = await createOrg()
    await fresh({ userId: employee.id, companyId: company.id }, async () => undefined)
    expect(log.mock.calls.filter((c) => String(c[0]).includes('contourne la RLS'))).toHaveLength(0)
  })

  it("l'application se connecte avec un rôle soumis à la RLS (F2)", async () => {
    const { rows } = await getPool().query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    )
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it("un utilisateur ne voit que les notes de son entreprise (F44)", async () => {
    const a = await createOrg()
    const b = await createOrg()
    const noteB = await createNote({ user: b.manager })
    await createNote({ user: a.employee })
    const visible = await runInScope(
      { userId: b.employee.id, companyId: b.company.id },
      async (client) => (await client.query('SELECT id FROM expense_notes')).rows.map((r) => r.id)
    )
    expect(visible).toEqual([noteB.id])
  })
})
