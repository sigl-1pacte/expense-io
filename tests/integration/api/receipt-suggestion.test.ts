import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/expense-notes/receipt-suggestion/route'
import { Unavailable } from '@/shared/errors'
import { createOrg, type Role } from '../../support/factories'
import { expectProblem, jsonBody, multipart, receiptFile } from '../helpers/http'
import { actAs, actAsAnonymous, actAsGhost } from '../helpers/session'

const recognizeMock = vi.hoisted(() => vi.fn<(image: Uint8Array) => Promise<string>>())
vi.mock('@/modules/expenses/infrastructure/TesseractReceiptReader', () => ({
  TesseractReceiptReader: class {
    recognize = recognizeMock
  },
}))

function ocrReturns(text: string) {
  recognizeMock.mockResolvedValue(text)
}

function suggest(fields: Record<string, string | Blob>) {
  return POST(multipart('/api/expense-notes/receipt-suggestion', fields))
}

const RECEIPT_TEXT = 'TOTAL TTC 42,50 €\nDate : 08/10/2026'

describe('POST /api/expense-notes/receipt-suggestion', () => {
  it("401 sans session, sans lancer l'OCR", async () => {
    actAsAnonymous()
    const response = await suggest({ receipt: receiptFile() })
    await expectProblem(response, 401, 'Unauthorized')
    expect(recognizeMock).not.toHaveBeenCalled()
  })

  it.each<Role>(['employee', 'manager', 'hr_admin'])(
    '%s : renvoie la suggestion telle quelle',
    async (role) => {
      const org = await createOrg()
      actAs({ employee: org.employee, manager: org.manager, hr_admin: org.hr }[role])
      ocrReturns(RECEIPT_TEXT)
      const response = await suggest({ receipt: receiptFile() })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ amount: 42.5, expenseDate: '2026-10-08' })
    }
  )

  it("session d'un utilisateur supprimé → 401", async () => {
    actAsGhost('employee')
    ocrReturns(RECEIPT_TEXT)
    await expectProblem(await suggest({ receipt: receiptFile() }), 401, 'Unauthorized')
  })

  it.each<[string, Record<string, string | Blob>]>([
    ['reçu absent', {}],
    ['reçu envoyé comme texte', { receipt: 'recu.png' }],
  ])('400 « Champs invalides » : %s', async (_label, fields) => {
    actAs((await createOrg()).employee)
    const response = await suggest(fields)
    await expectProblem(response, 400, 'Champs invalides')
  })

  it("PDF : 200 {} sans lancer l'OCR", async () => {
    actAs((await createOrg()).employee)
    const response = await suggest({ receipt: receiptFile({ type: 'application/pdf', name: 'r.pdf' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(recognizeMock).not.toHaveBeenCalled()
  })

  it('OCR en échec : 200 {}', async () => {
    actAs((await createOrg()).employee)
    recognizeMock.mockRejectedValue(new Error('modèle introuvable'))
    const response = await suggest({ receipt: receiptFile() })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
  })

  it('reçu de plus de 10 Mo : 400, sans reconnaissance (F19)', async () => {
    actAs((await createOrg()).employee)
    await expectProblem(await suggest({ receipt: receiptFile({ size: 10 * 1024 * 1024 + 1 }) }), 400, 'Fichier trop volumineux')
    expect(recognizeMock).not.toHaveBeenCalled()
  })

  it('OCR saturé : 503 avec Retry-After (F17)', async () => {
    actAs((await createOrg()).employee)
    recognizeMock.mockRejectedValue(new Unavailable('Analyse de reçu momentanément saturée, réessaie dans quelques secondes.', 5))
    const response = await suggest({ receipt: receiptFile() })
    await expectProblem(response, 503, 'Analyse de reçu momentanément saturée, réessaie dans quelques secondes.')
    expect(response.headers.get('retry-after')).toBe('5')
  })

  it('corps JSON → 400', async () => {
    actAs((await createOrg()).employee)
    const response = await POST(jsonBody('/api/expense-notes/receipt-suggestion', 'POST', {}))
    await expectProblem(response, 400, 'Corps de requête invalide')
  })
})
