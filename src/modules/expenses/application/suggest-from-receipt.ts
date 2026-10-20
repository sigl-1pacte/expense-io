import { InvalidInput, Unavailable } from '@/shared/errors'
import { logger } from '@/shared/logger'
import { SUPPORTED_OCR_TYPES, suggestFromText, type ReceiptSuggestion } from '../domain/ReceiptText'
import { MAX_RECEIPT_BYTES } from '../domain/Submission'
import type { ReceiptReader } from '../ports/ReceiptReader'

/** F19 : même plafond qu'à la création. Une panne OCR donne une suggestion vide ; la saturation, un 503. */
export function suggestFromReceipt(reader: ReceiptReader) {
  return async (receipt: { type: string; size: number; read(): Promise<Uint8Array> }): Promise<ReceiptSuggestion> => {
    if (receipt.size > MAX_RECEIPT_BYTES) throw new InvalidInput('Fichier trop volumineux')
    if (!SUPPORTED_OCR_TYPES.includes(receipt.type)) return {}
    try {
      return suggestFromText(await reader.recognize(await receipt.read()))
    } catch (error) {
      if (error instanceof Unavailable) throw error
      logger.error('Extraction OCR échouée, suggestion vide renvoyée', { error })
      return {}
    }
  }
}
