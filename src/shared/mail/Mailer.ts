/** Un e-mail entièrement décidé par le cœur : destinataire, objet, texte. */
export interface Email {
  to: string
  subject: string
  text: string
  correlationId?: string
}

/**
 * Port générique d'envoi. Le cœur ne sait pas si l'e-mail part tout de suite
 * ou plus tard : en production, OutboxMailer l'écrit dans mail_outbox.
 */
export interface Mailer {
  send(email: Email): Promise<void>
}
