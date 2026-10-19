import { describe, expect, it } from 'vitest'
import { suggestFromText } from '@/modules/expenses/domain/ReceiptText'

describe('suggestFromText — montant', () => {
  it.each<[string, string, number | undefined]>([
    ['ligne à mot-clé prioritaire', 'Café 3,50\nTOTAL TTC 42,50 €', 42.5],
    ['mot-clé prioritaire même face à un montant plus élevé', 'Article 99,99\nTotal 10,00', 10],
    ['[as-is] seule la première ligne à mot-clé compte', 'Montant 5,00\nTotal 50,00', 5],
    ['maximum des décimaux de la ligne à mot-clé', 'Total HT 35,00 TVA 7,00 TTC 42,00', 42],
    ['sans mot-clé : maximum de tout le ticket', 'Pain 1,20\nVin 12,90', 12.9],
    ['séparateur de milliers espace', 'Total 1 234,56', 1234.56],
    ['séparateur de milliers point', 'Total 1.234,56', 1234.56],
    ['point décimal', 'Total 42.50', 42.5],
    ['mot-clé en majuscules accentuées', 'NET À PAYER 18,00', 18],
    ["repli sur les entiers d'une ligne à mot-clé", 'TOTAL 42 EUR', 42],
    ["repli sur les entiers d'une ligne avec €", 'Ticket n°12\nPayé 30 €', 30],
    ['repli : plus grand entier', 'Total 12 ou 300 €', 300],
    [
      '[as-is] mot-clé sans décimal : les décimaux des autres lignes sont ignorés',
      'Article 9,99\nTotal 15',
      15,
    ],
    ['entiers sans mot-clé ni devise ignorés', 'Table 12\nCouverts 4', undefined],
    ['montant nul ignoré', 'Total 0,00', undefined],
    ['entier de plus de 5 chiffres ignoré', 'Total 123456 €', undefined],
    ['aucun nombre', 'Merci de votre visite', undefined],
  ])('%s', (_label, text, amount) => {
    expect(suggestFromText(text).amount).toBe(amount)
  })
})

describe('suggestFromText — date', () => {
  it.each<[string, string, string | undefined]>([
    ['jj/mm/aaaa', 'Date : 08/10/2026', '2026-10-08'],
    ['jj.mm.aaaa', 'Le 08.10.2026', '2026-10-08'],
    ['jj-mm-aaaa', '08-10-2026', '2026-10-08'],
    ['aaaa-mm-jj', 'Émis le 2026-10-08', '2026-10-08'],
    ['jj/mm/aa → 20aa', 'Date 08/10/26', '2026-10-08'],
    ['[as-is] année sur 2 chiffres toujours au XXIe siècle', 'Date 01/01/99', '2099-01-01'],
    ['date textuelle accentuée', 'Paris, le 3 août 2026', '2026-08-03'],
    ['date textuelle avec majuscule', 'le 15 Décembre 2025', '2025-12-15'],
    ["priorité à jj/mm/aaaa sur l'ISO", '2026-01-02 puis 05/06/2026', '2026-06-05'],
    ['jj/mm/aaaa invalide → motif suivant', '31/02/2026 ou 2026-03-01', '2026-03-01'],
    ['[as-is] seule la première date jj/mm/aaaa est essayée', '31/02/2026 et 05/06/2026', undefined],
    ['[as-is] format américain mm/jj/aaaa non reconnu', '12/31/2026', undefined],
    ['date impossible', '31/02/2026', undefined],
    ['aucune date', 'Merci de votre visite', undefined],
  ])('%s', (_label, text, expenseDate) => {
    expect(suggestFromText(text).expenseDate).toBe(expenseDate)
  })
})

describe('suggestFromText — résultat et erreurs', () => {
  it('renvoie montant et date ensemble', () => {
    expect(suggestFromText('TOTAL TTC 42,50 €\nDate : 08/10/2026')).toEqual({
      amount: 42.5,
      expenseDate: '2026-10-08',
    })
  })

  it('ticket illisible : aucune suggestion', () => {
    expect(suggestFromText('@@@ ###')).toEqual({})
  })
})
