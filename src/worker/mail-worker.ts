// Worker de livraison des e-mails (ADR 0003). Infrastructure hors de
// l'hexagone : aucun code métier, aucun import de modules/. Il réserve des
// lignes de mail_outbox par bail, envoie en SMTP hors transaction, marque
// sent, réessaie, puis passe en dead au troisième échec.
import { createTransport, type Transporter } from 'nodemailer'
import { Pool } from 'pg'
import { loadMailerConfig, sendDeadlineMs, type MailerConfig } from '@/shared/config'
import { logger } from '@/shared/logger'

export interface OutboxRow {
  id: string
  recipient: string
  subject: string
  body_text: string
  correlation_id: string | null
  attempts: number
}

/** Réservation courte, aussitôt validée : aucun verrou pendant l'envoi SMTP. */
export async function claimBatch(pool: Pool, batchSize: number, leaseSeconds: number): Promise<OutboxRow[]> {
  const { rows } = await pool.query<OutboxRow>(
    `UPDATE mail_outbox SET next_attempt_at = now() + make_interval(secs => $2)
     WHERE id IN (SELECT id FROM mail_outbox
                  WHERE status = 'pending' AND next_attempt_at <= now()
                  ORDER BY created_at LIMIT $1
                  FOR UPDATE SKIP LOCKED)
     RETURNING id, recipient, subject, body_text, correlation_id, attempts`,
    [batchSize, leaseSeconds]
  )
  return rows
}

/** Ne touche qu'une ligne encore `pending` : une ligne déjà traitée ou reprise n'est plus à nous. */
export async function markSent(pool: Pool, id: string): Promise<void> {
  await pool.query(
    "UPDATE mail_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1 AND status = 'pending'",
    [id]
  )
}

/** 10 s après le premier échec, puis 1 min ; `dead` au troisième. `null` : la ligne n'est plus à nous. */
export async function markFailed(pool: Pool, id: string, error: unknown): Promise<'pending' | 'dead' | null> {
  const { rows } = await pool.query<{ status: 'pending' | 'dead' }>(
    `UPDATE mail_outbox
     SET attempts = attempts + 1,
         last_error = $2,
         status = CASE WHEN attempts + 1 >= 3 THEN 'dead' ELSE 'pending' END,
         next_attempt_at = now() + CASE WHEN attempts = 0 THEN interval '10 seconds' ELSE interval '1 minute' END
     WHERE id = $1 AND status = 'pending'
     RETURNING status`,
    [id, error instanceof Error ? error.message : String(error)]
  )
  return rows[0]?.status ?? null
}

export async function purgeSent(pool: Pool, olderThanDays: number): Promise<number> {
  const { rowCount } = await pool.query(
    "DELETE FROM mail_outbox WHERE status = 'sent' AND sent_at < now() - make_interval(days => $1)",
    [olderThanDays]
  )
  return rowCount ?? 0
}

/** nodemailer ne plafonne pas la durée totale d'un envoi : on coupe nous-mêmes. */
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Envoi SMTP interrompu : délai de ${ms} ms dépassé`)), ms)
  })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    clearTimeout(timer)
  }
}

export async function deliverBatch(deps: {
  pool: Pool
  transport: Pick<Transporter, 'sendMail'>
  config: MailerConfig
}): Promise<{ sent: number; failed: number }> {
  const { pool, transport, config } = deps
  const rows = await claimBatch(pool, config.batchSize, config.leaseSeconds)
  let sent = 0
  let failed = 0
  for (const row of rows) {
    try {
      await withDeadline(
        transport.sendMail({
          from: config.mailFrom,
          to: row.recipient,
          subject: row.subject,
          text: row.body_text,
          // Repère les doublons possibles (livraison au moins une fois).
          messageId: `<${row.id}@expense.io>`,
        }),
        sendDeadlineMs(config)
      )
    } catch (error) {
      failed++
      const status = await markFailed(pool, row.id, error)
      if (status === null) {
        logger.warn('Échec d’envoi ignoré : la ligne n’est plus en attente', { correlationId: row.correlation_id, outboxId: row.id, error })
        continue
      }
      const log = status === 'dead' ? logger.error : logger.warn
      log(status === 'dead' ? 'E-mail abandonné (dead) : npm run mail:replay pour le rejouer' : 'Envoi échoué, nouvel essai planifié', {
        correlationId: row.correlation_id,
        outboxId: row.id,
        error,
      })
      continue
    }
    try {
      await markSent(pool, row.id)
      sent++
      logger.info('E-mail envoyé', { correlationId: row.correlation_id, outboxId: row.id })
    } catch (error) {
      // Ce n'est pas un échec SMTP : pas de markFailed, la ligne repartira au bail.
      logger.error('E-mail envoyé mais non marqué : il sera renvoyé à l’expiration du bail', {
        correlationId: row.correlation_id,
        outboxId: row.id,
        error,
      })
    }
  }
  return { sent, failed }
}

export function startWorker(config: MailerConfig): { stop(): Promise<void> } {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 2 })
  // Une erreur sur un client inactif ne doit pas faire tomber le worker.
  pool.on('error', (error) => logger.error('Erreur du pool PostgreSQL (client inactif)', { error }))
  const transport = createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    connectionTimeout: config.connectionTimeoutMs,
    greetingTimeout: config.greetingTimeoutMs,
    socketTimeout: config.socketTimeoutMs,
  })
  let stopping = false
  let lastPurge = 0
  const loop = (async () => {
    logger.info('Worker de livraison démarré', { batchSize: config.batchSize, leaseSeconds: config.leaseSeconds })
    while (!stopping) {
      try {
        await deliverBatch({ pool, transport, config })
        if (Date.now() - lastPurge > 3600_000) {
          const purged = await purgeSent(pool, config.purgeAfterDays)
          if (purged > 0) logger.info('Lignes envoyées purgées', { purged })
          lastPurge = Date.now()
        }
      } catch (error) {
        logger.error('Tour du worker échoué', { error })
      }
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))
    }
  })()
  return {
    async stop() {
      // SIGTERM : on finit l'envoi en cours, on ne réserve plus rien.
      stopping = true
      await loop
      transport.close()
      await pool.end()
      logger.info('Worker de livraison arrêté')
    },
  }
}

if (process.argv[1]?.endsWith('mail-worker.ts')) {
  const worker = startWorker(loadMailerConfig())
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void worker.stop().then(() => process.exit(0))
    })
  }
}
