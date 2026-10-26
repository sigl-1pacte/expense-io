// Qui prévenir, et quoi lui dire : décision métier, prise dans le cœur.
// Le worker de livraison ne fait qu'envoyer ce texte.
import type { Email } from '@/shared/mail/Mailer'
import type { Decision } from '../domain/ExpenseNote'

const amountFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
// La date de dépense est une date civile (YYYY-MM-DD) : formatée en UTC pour ne jamais glisser d'un jour.
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })

export function decisionEmail(
  contact: { name: string; email: string },
  note: { amount: number; expenseDate: string; status: Decision; comment?: string },
  correlationId: string
): Email {
  const verdict = note.status === 'approved' ? 'approuvée' : 'refusée'
  return {
    to: contact.email,
    subject: `Votre note de frais a été ${verdict}`,
    text: [
      `Bonjour ${contact.name},`,
      '',
      `Votre note de frais de ${amountFormat.format(note.amount)} du ${dateFormat.format(new Date(note.expenseDate))} a été ${verdict}.`,
      ...(note.comment ? ['', `Commentaire de votre validateur : ${note.comment}`] : []),
      '',
      '— Expense.io',
    ].join('\n'),
    correlationId,
  }
}
