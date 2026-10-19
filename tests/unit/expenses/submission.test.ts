import { describe, expect, it } from 'vitest'
import { MAX_RECEIPT_BYTES, parseSubmission, receiptKeyFor, type ReceiptFile } from '@/modules/expenses/domain/Submission'
import { InvalidInput } from '@/shared/errors'

function receipt(partial: Partial<ReceiptFile> = {}): ReceiptFile {
  return { name: 'recu.png', type: 'image/png', size: 10, read: async () => new Uint8Array(10), ...partial }
}

const valid = { amount: '42.50', expenseDate: '2026-10-08', description: 'Taxi', receipt: receipt() }

describe('parseSubmission', () => {
  it('lit une soumission valide', () => {
    expect(parseSubmission(valid)).toMatchObject({ amount: 42.5, expenseDate: '2026-10-08', description: 'Taxi' })
  })

  it.each<[string, Partial<typeof valid> | { amount?: unknown; receipt?: null }]>([
    ['montant absent', { amount: undefined }],
    ['montant non numérique', { amount: 'abc' }],
    ['montant nul', { amount: '0' }],
    ['date absente', { expenseDate: undefined }],
    ['description vide', { description: '   ' }],
    ['reçu absent', { receipt: null }],
  ])('« Champs invalides » : %s', (_label, override) => {
    expect(() => parseSubmission({ ...valid, ...override } as never)).toThrow(new InvalidInput('Champs invalides'))
  })

  it('type refusé avant la taille', () => {
    expect(() =>
      parseSubmission({ ...valid, receipt: receipt({ type: 'text/plain', size: MAX_RECEIPT_BYTES + 1 }) })
    ).toThrow(new InvalidInput('Type de fichier non autorisé pour le reçu'))
  })

  it('refuse 10 Mo + 1 octet, accepte 10 Mo pile', () => {
    expect(() => parseSubmission({ ...valid, receipt: receipt({ size: MAX_RECEIPT_BYTES + 1 }) })).toThrow(
      new InvalidInput('Fichier trop volumineux')
    )
    expect(() => parseSubmission({ ...valid, receipt: receipt({ size: MAX_RECEIPT_BYTES }) })).not.toThrow()
  })
})

describe('receiptKeyFor', () => {
  it.each([
    ['image/png', 'receipts/7.png'],
    ['image/jpeg', 'receipts/7.jpg'],
    ['image/webp', 'receipts/7.webp'],
    ['application/pdf', 'receipts/7.pdf'],
  ])('%s → %s', (type, key) => {
    expect(receiptKeyFor(7, { name: 'recu.bin', type })).toBe(key)
  })
})

describe('receiptKeyFor — type inconnu', () => {
  it('retombe sur l’extension du nom de fichier', () => {
    expect(receiptKeyFor(3, { name: 'scan.pdf', type: 'application/octet-stream' })).toBe('receipts/3.pdf')
  })
})
