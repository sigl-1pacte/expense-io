import type { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const BYPASS_SQL = /rolbypassrls/

/** Client factice : `bypass` pilote le rôle, `failRollback` fait échouer ROLLBACK. */
function fakePool(opts: { bypass: boolean; failRollback?: boolean }) {
  const release = vi.fn()
  const calls: string[] = []
  const client = {
    release,
    query: vi.fn(async (sql: string) => {
      calls.push(sql)
      if (BYPASS_SQL.test(sql)) return { rows: [{ bypass: opts.bypass }] }
      if (sql.includes('app.actor')) return { rows: [{ company_id: 'c1' }] }
      if (sql === 'ROLLBACK' && opts.failRollback) throw new Error('connexion perdue')
      return { rows: [] }
    }),
  }
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool
  return { pool, client, release, calls }
}

async function loadDb(pool: Pool) {
  vi.resetModules()
  global.__pgPool = pool
  return import('@/lib/db')
}

const warnLines = () =>
  vi
    .mocked(console.log)
    .mock.calls.map((c) => JSON.parse(c[0] as string))
    .filter((l) => l.level === 'warn')

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  global.__pgPool = undefined
  vi.restoreAllMocks()
})

describe('withUserScope : rôle qui contourne la RLS', () => {
  it('avertit une seule fois par process quand le rôle est superutilisateur ou BYPASSRLS', async () => {
    const { pool } = fakePool({ bypass: true })
    const { withUserScope } = await loadDb(pool)
    await withUserScope('u1', async () => undefined)
    await withUserScope('u1', async () => undefined)
    const warns = warnLines()
    expect(warns).toHaveLength(1)
    expect(warns[0].message).toContain('contourne la RLS')
    expect(warns[0].message).toContain('dev-environnement-demarrer.md')
  })

  it("n'avertit pas quand le rôle est soumis à la RLS", async () => {
    const { pool } = fakePool({ bypass: false })
    const { withUserScope } = await loadDb(pool)
    await withUserScope('u1', async () => undefined)
    expect(warnLines()).toHaveLength(0)
  })
})

describe('withUserScope : ROLLBACK', () => {
  it("relance l'erreur d'origine même si ROLLBACK échoue, et détruit la connexion", async () => {
    const { pool, release } = fakePool({ bypass: false, failRollback: true })
    const { withUserScope } = await loadDb(pool)
    await expect(
      withUserScope('u1', async () => {
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(release).toHaveBeenCalledWith(true)
  })

  it('rend la connexion au pool quand ROLLBACK réussit', async () => {
    const { pool, release } = fakePool({ bypass: false })
    const { withUserScope } = await loadDb(pool)
    await expect(
      withUserScope('u1', async () => {
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(release).toHaveBeenCalledWith(undefined)
  })
})
