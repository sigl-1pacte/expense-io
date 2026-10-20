// Adapter du port Mailer : écrit l'e-mail dans mail_outbox, sur la connexion
// de l'unité de travail. La note et son e-mail sont donc écrits ensemble, ou
// pas du tout (ADR 0003). Le worker de livraison fera l'envoi SMTP.
import type { Sql } from '../unit-of-work'
import type { Email, Mailer } from './Mailer'

export class OutboxMailer implements Mailer {
  constructor(private readonly sql: Sql) {}

  async send(email: Email): Promise<void> {
    await this.sql.query(
      `INSERT INTO mail_outbox (recipient, subject, body_text, correlation_id)
       VALUES ($1, $2, $3, $4)`,
      [email.to, email.subject, email.text, email.correlationId ?? null]
    )
  }
}
