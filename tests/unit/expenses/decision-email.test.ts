import { describe, expect, it } from 'vitest'
import { decisionEmail } from '@/modules/expenses/application/decision-email'

const emma = { name: 'Emma Employée', email: 'emma@acme.fr' }

describe('decisionEmail (point de vigilance 5)', () => {
  it('note approuvée : objet, montant et date au format français', () => {
    const email = decisionEmail(emma, { amount: 42.5, expenseDate: '2026-10-08', status: 'approved' }, 'corr-1')
    expect(email.to).toBe('emma@acme.fr')
    expect(email.subject).toBe('Votre note de frais a été approuvée')
    expect(email.text).toContain('Bonjour Emma Employée,')
    expect(email.text).toContain(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(42.5))
    expect(email.text).toContain('8 octobre 2026')
    expect(email.correlationId).toBe('corr-1')
  })

  it('note refusée', () => {
    const email = decisionEmail(emma, { amount: 7, expenseDate: '2026-01-01', status: 'rejected' }, 'c')
    expect(email.subject).toBe('Votre note de frais a été refusée')
    expect(email.text).toContain('1 janvier 2026')
  })

  it('le commentaire du validateur figure dans le message', () => {
    const email = decisionEmail(emma, { amount: 7, expenseDate: '2026-01-01', status: 'rejected', comment: 'Reçu illisible' }, 'c')
    expect(email.text).toContain('Commentaire de votre validateur : Reçu illisible')
  })

  it('sans commentaire, aucune ligne de commentaire', () => {
    const email = decisionEmail(emma, { amount: 7, expenseDate: '2026-01-01', status: 'approved' }, 'c')
    expect(email.text).not.toContain('Commentaire')
  })
})
