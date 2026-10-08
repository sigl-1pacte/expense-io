import { describe, expect, it } from 'vitest'
import { getPool, withUserScope } from '@/lib/db'
import { countRows, createNote, createOrg, createUser } from '../../support/factories'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CURRENT_USER = "SELECT current_setting('app.current_user_id', true) AS value"

describe('withUserScope', () => {
  it("expose l'utilisateur courant aux policies pendant la transaction", async () => {
    const value = await withUserScope(
      USER_ID,
      async (client) => (await client.query<{ value: string }>(CURRENT_USER)).rows[0].value
    )
    expect(value).toBe(USER_ID)
  })

  it('ne laisse pas app.current_user_id sur la connexion rendue au pool', async () => {
    await withUserScope(USER_ID, async () => undefined)
    const client = await getPool().connect()
    try {
      const { rows } = await client.query<{ value: string | null }>(CURRENT_USER)
      expect(rows[0].value ?? '').toBe('')
    } finally {
      client.release()
    }
  })

  it('valide la transaction et renvoie le résultat de la fonction', async () => {
    const result = await withUserScope(USER_ID, async (client) => {
      await client.query("INSERT INTO companies (name, email_domain) VALUES ('commit', 'commit.test')")
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(await countRows('companies')).toBe(1)
  })

  it("annule la transaction et relance l'erreur", async () => {
    await expect(
      withUserScope(USER_ID, async (client) => {
        await client.query(
          "INSERT INTO companies (name, email_domain) VALUES ('rollback', 'rollback.test')"
        )
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(await countRows('companies')).toBe(0)
  })
})

describe('Row Level Security', () => {
  it("[as-is] l'application se connecte en superutilisateur (audit §1)", async () => {
    const { rows } = await getPool().query<{ rolsuper: boolean }>(
      'SELECT rolsuper FROM pg_roles WHERE rolname = current_user'
    )
    expect(rows[0].rolsuper).toBe(true)
  })

  it('[as-is] un utilisateur sans lien voit toutes les notes malgré la RLS (audit §1)', async () => {
    const a = await createOrg()
    const b = await createOrg()
    await createNote({ user: a.employee })
    await createNote({ user: b.manager })
    const stranger = await createUser({ company: b.company })
    const visible = await withUserScope(
      stranger.id,
      async (client) => (await client.query('SELECT id FROM expense_notes')).rowCount
    )
    expect(visible).toBe(2)
  })
})
