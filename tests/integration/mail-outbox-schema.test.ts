import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { TEST_ENV } from '../support/env'

async function as<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

const INSERT = `INSERT INTO mail_outbox (recipient, subject, body_text, correlation_id)
                VALUES ('a@acme.fr', 'Objet', 'Texte', 'c1')`

describe('mail_outbox', () => {
  it('expense_app peut écrire mais pas lire', async () => {
    await as(TEST_ENV.APP_DATABASE_URL, (c) => c.query(INSERT))
    await expect(as(TEST_ENV.APP_DATABASE_URL, (c) => c.query('SELECT * FROM mail_outbox'))).rejects.toThrow(
      'permission denied'
    )
  })

  it('expense_mailer lit, met à jour et supprime, avec les valeurs par défaut attendues', async () => {
    await as(TEST_ENV.APP_DATABASE_URL, (c) => c.query(INSERT))
    const row = await as(TEST_ENV.MAILER_DATABASE_URL, async (c) => {
      const { rows } = await c.query('SELECT status, attempts, sent_at FROM mail_outbox')
      await c.query("UPDATE mail_outbox SET status = 'sent', sent_at = now()")
      await c.query("DELETE FROM mail_outbox WHERE status = 'sent'")
      return rows[0]
    })
    expect(row).toEqual({ status: 'pending', attempts: 0, sent_at: null })
  })

  it("expense_mailer n'a aucun droit ailleurs", async () => {
    await expect(as(TEST_ENV.MAILER_DATABASE_URL, (c) => c.query('SELECT 1 FROM users'))).rejects.toThrow('permission denied')
    await expect(as(TEST_ENV.MAILER_DATABASE_URL, (c) => c.query('SELECT 1 FROM expense_notes'))).rejects.toThrow(
      'permission denied'
    )
  })

  it('refuse un statut inconnu', async () => {
    await as(TEST_ENV.APP_DATABASE_URL, (c) => c.query(INSERT))
    await expect(
      as(TEST_ENV.MAILER_DATABASE_URL, (c) => c.query("UPDATE mail_outbox SET status = 'perdu'"))
    ).rejects.toThrow('mail_outbox_status_check')
  })
})
