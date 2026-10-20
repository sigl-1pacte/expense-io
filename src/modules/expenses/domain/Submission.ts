import path from 'node:path'
import { InvalidInput } from '@/shared/errors'

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
export const ALLOWED_RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

/** Fichier reçu : contenu lu à la demande, après validation. */
export interface ReceiptFile {
  name: string
  type: string
  size: number
  read(): Promise<Uint8Array>
}

export interface Submission {
  amount: number
  expenseDate: string
  description: string
  receipt: ReceiptFile
}

/** Mêmes règles et mêmes messages qu'avant la refacto (contrat inchangé). */
export function parseSubmission(fields: {
  amount: unknown
  expenseDate: unknown
  description: unknown
  receipt: ReceiptFile | null
}): Submission {
  const amount = typeof fields.amount === 'string' ? Number.parseFloat(fields.amount) : Number.NaN
  const { expenseDate, description, receipt } = fields
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof expenseDate !== 'string' ||
    typeof description !== 'string' ||
    description.trim().length === 0 ||
    receipt === null
  ) {
    throw new InvalidInput('Champs invalides')
  }
  if (!ALLOWED_RECEIPT_TYPES.includes(receipt.type)) {
    throw new InvalidInput('Type de fichier non autorisé pour le reçu')
  }
  if (receipt.size > MAX_RECEIPT_BYTES) {
    throw new InvalidInput('Fichier trop volumineux')
  }
  return { amount, expenseDate, description, receipt }
}

export function receiptKeyFor(seq: number, receipt: { name: string; type: string }): string {
  const extension = EXTENSION_BY_MIME[receipt.type] ?? path.extname(receipt.name)
  return `receipts/${seq}${extension}`
}
