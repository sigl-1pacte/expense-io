// Remet les e-mails `dead` en file (après correction de la cause : SMTP, adresse…).
//   npm run mail:replay              tous les dead
//   npm run mail:replay -- <id> …    seulement ces lignes
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ quiet: true })
const ids = process.argv.slice(2)
const client = new pg.Client({ connectionString: process.env.MAILER_DATABASE_URL })
await client.connect()
try {
  const { rowCount } = await client.query(
    `UPDATE mail_outbox SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL
     WHERE status = 'dead' AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))`,
    [ids.length > 0 ? ids : null]
  )
  console.log(`${rowCount} e-mail(s) remis en file.`)
} finally {
  await client.end()
}
