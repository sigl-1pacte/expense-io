import { Pool } from 'pg'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { loadMailerConfig } from '@/shared/config'
import { claimBatch, deliverBatch, markFailed, markSent, purgeSent } from '@/worker/mail-worker'
import { createTransport } from 'nodemailer'
import { testDb } from '../../support/db'
import { TEST_ENV } from '../../support/env'
import { mailpitMessages } from '../../support/mailpit'

const config = loadMailerConfig(TEST_ENV)
const pool = new Pool({ connectionString: TEST_ENV.MAILER_DATABASE_URL, max: 4 })
const transport = createTransport({ host: config.smtpHost, port: config.smtpPort })

async function queue(recipient: string, overrides: Record<string, unknown> = {}) {
  const { rows } = await testDb().query<{ id: string }>(
    `INSERT INTO mail_outbox (recipient, subject, body_text, correlation_id, status, attempts, sent_at, created_at)
     VALUES ($1, 'Objet', 'Texte', 'c', $2, $3, $4, COALESCE($5, now())) RETURNING id`,
    [recipient, overrides.status ?? 'pending', overrides.attempts ?? 0, overrides.sent_at ?? null, overrides.created_at ?? null]
  )
  return rows[0].id
}

const rowOf = async (id: string) =>
  (await testDb().query('SELECT status, attempts, last_error FROM mail_outbox WHERE id = $1', [id])).rows[0]

afterAll(async () => {
  transport.close()
  await pool.end()
})

describe('worker de livraison', () => {
  it('envoie une ligne pending à Mailpit puis la marque sent, Message-ID = id de la ligne', async () => {
    const id = await queue('emma@acme.fr')
    expect(await deliverBatch({ pool, transport, config })).toEqual({ sent: 1, failed: 0 })
    const message = (await mailpitMessages()).find((m) => m.MessageID === `${id}@expense.io`)!
    expect(message.To[0].Address).toBe('emma@acme.fr')
    expect(message.MessageID).toBe(`${id}@expense.io`)
    expect((await rowOf(id)).status).toBe('sent')
  })

  it('crash après la réservation : la ligne repart à l’expiration du bail (point de vigilance 1)', async () => {
    const id = await queue('a@acme.fr')
    expect((await claimBatch(pool, 5, 1)).map((r) => r.id)).toEqual([id])
    // « Crash » : rien n'est marqué. Pendant le bail, personne ne la reprend.
    expect(await claimBatch(pool, 5, 1)).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect((await claimBatch(pool, 5, 1)).map((r) => r.id)).toEqual([id])
  })

  it('deux workers en parallèle ne réservent jamais la même ligne (point de vigilance 2)', async () => {
    for (let i = 0; i < 10; i++) await queue(`u${i}@acme.fr`)
    const [a, b] = await Promise.all([claimBatch(pool, 5, 60), claimBatch(pool, 5, 60)])
    const ids = [...a, ...b].map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(10)
  })

  it('SMTP en panne : retry puis dead au troisième échec', async () => {
    const id = await queue('b@acme.fr')
    const broken = { sendMail: async () => Promise.reject(new Error('SMTP indisponible')) }
    expect(await markFailed(pool, id, new Error('x'))).toBe('pending')
    expect(await markFailed(pool, id, new Error('x'))).toBe('pending')
    await testDb().query('UPDATE mail_outbox SET next_attempt_at = now() WHERE id = $1', [id])
    expect(await deliverBatch({ pool, transport: broken, config })).toEqual({ sent: 0, failed: 1 })
    expect(await rowOf(id)).toEqual({ status: 'dead', attempts: 3, last_error: 'SMTP indisponible' })
  })

  it('markSent et markFailed ne touchent pas une ligne déjà sent (P3-R12)', async () => {
    const id = await queue('e@acme.fr', { status: 'sent', sent_at: new Date() })
    expect(await markFailed(pool, id, new Error('tard'))).toBeNull()
    await markSent(pool, id)
    expect(await rowOf(id)).toEqual({ status: 'sent', attempts: 0, last_error: null })
  })

  it('un envoi qui ne se termine jamais est coupé par le délai dur puis marqué échoué (P3-R12)', async () => {
    const id = await queue('f@acme.fr')
    const hanging = { sendMail: () => new Promise<never>(() => {}) }
    const tiny = { ...config, connectionTimeoutMs: 20, greetingTimeoutMs: 20, socketTimeoutMs: 20 }
    expect(await deliverBatch({ pool, transport: hanging, config: tiny })).toEqual({ sent: 0, failed: 1 })
    expect(await rowOf(id)).toMatchObject({ status: 'pending', attempts: 1 })
    expect((await rowOf(id)).last_error).toMatch(/délai/)
  })

  it('e-mail envoyé mais markSent en échec : pas de markFailed, la ligne repartira au bail (P3-R12)', async () => {
    const id = await queue('g@acme.fr')
    const sendMail = vi.fn(async () => ({}))
    const brokenPool = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("status = 'sent'")) throw new Error('base indisponible')
        return pool.query(sql, params)
      },
    } as unknown as Pool
    await deliverBatch({ pool: brokenPool, transport: { sendMail }, config })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(await rowOf(id)).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('premier échec : nouvel essai dans 10 s', async () => {
    const id = await queue('c@acme.fr')
    await markFailed(pool, id, new Error('x'))
    const { rows } = await testDb().query(
      "SELECT next_attempt_at > now() + interval '8 seconds' AND next_attempt_at < now() + interval '12 seconds' AS ok FROM mail_outbox WHERE id = $1",
      [id]
    )
    expect(rows[0].ok).toBe(true)
  })

  it('purge les lignes sent de plus de 30 jours, pas les autres', async () => {
    await queue('old@acme.fr', { status: 'sent', sent_at: new Date(Date.now() - 31 * 86400_000) })
    const recent = await queue('new@acme.fr', { status: 'sent', sent_at: new Date() })
    const dead = await queue('dead@acme.fr', { status: 'dead', created_at: new Date(Date.now() - 90 * 86400_000) })
    expect(await purgeSent(pool, 30)).toBe(1)
    const { rows } = await testDb().query('SELECT id FROM mail_outbox ORDER BY id')
    expect(rows.map((r) => r.id).sort()).toEqual([recent, dead].sort())
  })

  it('mail:replay remet les dead en pending', async () => {
    const id = await queue('d@acme.fr', { status: 'dead', attempts: 3 })
    const { execFileSync } = await import('node:child_process')
    execFileSync('node', ['scripts/mail-replay.mjs'], {
      env: { ...process.env, MAILER_DATABASE_URL: TEST_ENV.MAILER_DATABASE_URL },
    })
    expect(await rowOf(id)).toMatchObject({ status: 'pending', attempts: 0 })
  })
})
