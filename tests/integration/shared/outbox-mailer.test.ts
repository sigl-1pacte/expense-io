import { describe, expect, it } from 'vitest'
import { OutboxMailer } from '@/shared/mail/OutboxMailer'
import { runInScope } from '@/shared/unit-of-work'
import { testDb } from '../../support/db'
import { createOrg } from '../../support/factories'

const EMAIL = { to: 'emma@acme.fr', subject: 'Objet', text: 'Texte', correlationId: 'corr-1' }

describe('OutboxMailer', () => {
  it("écrit l'e-mail dans mail_outbox, dans la transaction en cours", async () => {
    const { employee } = await createOrg()
    await runInScope({ userId: employee.id, companyId: employee.company_id }, (sql) => new OutboxMailer(sql).send(EMAIL))
    const { rows } = await testDb().query('SELECT recipient, subject, body_text, correlation_id, status FROM mail_outbox')
    expect(rows).toEqual([
      { recipient: 'emma@acme.fr', subject: 'Objet', body_text: 'Texte', correlation_id: 'corr-1', status: 'pending' },
    ])
  })

  it('annulé avec la transaction : rien n’est écrit', async () => {
    const { employee } = await createOrg()
    await expect(
      runInScope({ userId: employee.id, companyId: employee.company_id }, async (sql) => {
        await new OutboxMailer(sql).send(EMAIL)
        throw new Error('décision annulée')
      })
    ).rejects.toThrow('décision annulée')
    expect((await testDb().query('SELECT count(*)::int AS n FROM mail_outbox')).rows[0].n).toBe(0)
  })
})
