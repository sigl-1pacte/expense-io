import type { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCOPE = { userId: 'u1', companyId: 'c1' }
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
      if (sql === 'ROLLBACK' && opts.failRollback) throw new Error('connexion perdue')
      return { rows: [] }
    }),
  }
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool
  return { pool, client, release, calls }
}

async function loadUow(pool: Pool) {
  vi.resetModules()
  global.__pgPool = pool
  return import('@/shared/unit-of-work')
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

describe('runInScope : rôle qui contourne la RLS', () => {
  it('avertit une seule fois par process quand le rôle est superutilisateur ou BYPASSRLS', async () => {
    const { pool } = fakePool({ bypass: true })
    const { runInScope } = await loadUow(pool)
    await runInScope(SCOPE, async () => undefined)
    await runInScope(SCOPE, async () => undefined)
    const warns = warnLines()
    expect(warns).toHaveLength(1)
    expect(warns[0].message).toContain('contourne la RLS')
    expect(warns[0].message).toContain('dev-environnement-demarrer.md')
  })

  it("n'avertit pas quand le rôle est soumis à la RLS", async () => {
    const { pool } = fakePool({ bypass: false })
    const { runInScope } = await loadUow(pool)
    await runInScope(SCOPE, async () => undefined)
    expect(warnLines()).toHaveLength(0)
  })
})

describe('runInScope : ROLLBACK', () => {
  it("relance l'erreur d'origine même si ROLLBACK échoue, et détruit la connexion", async () => {
    const { pool, release } = fakePool({ bypass: false, failRollback: true })
    const { runInScope } = await loadUow(pool)
    await expect(
      runInScope(SCOPE, async () => {
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(release).toHaveBeenCalledWith(true)
  })

  it('rend la connexion au pool quand ROLLBACK réussit', async () => {
    const { pool, release } = fakePool({ bypass: false })
    const { runInScope } = await loadUow(pool)
    await expect(
      runInScope(SCOPE, async () => {
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(release).toHaveBeenCalledWith(undefined)
  })
})
