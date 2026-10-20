import type { Email, Mailer } from './Mailer'

/** Doublure de test : garde les e-mails « envoyés ». */
export class InMemoryMailer implements Mailer {
  readonly sent: Email[] = []

  async send(email: Email): Promise<void> {
    this.sent.push(email)
  }
}
