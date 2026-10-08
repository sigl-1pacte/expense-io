import { describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { POST } from '@/app/api/expense-notes/receipt-suggestion/route'
import { createOrg, type Role } from '../../support/factories'
import { jsonBody, multipart, readJson, receiptFile, type ErrorBody } from '../helpers/http'
import { actAs, actAsAnonymous, actAsGhost } from '../helpers/session'

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

function ocrReturns(text: string) {
  const worker = {
    recognize: vi.fn().mockResolvedValue({ data: { text } }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(createWorker).mockResolvedValue(worker as unknown as TesseractWorker)
  return worker
}

function suggest(fields: Record<string, string | Blob>) {
  return POST(multipart('/api/expense-notes/receipt-suggestion', fields))
}

const RECEIPT_TEXT = 'TOTAL TTC 42,50 €\nDate : 08/10/2026'

describe('POST /api/expense-notes/receipt-suggestion', () => {
  it("401 sans session, sans lancer l'OCR", async () => {
    actAsAnonymous()
    const response = await suggest({ receipt: receiptFile() })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(createWorker).not.toHaveBeenCalled()
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

  it("session d'un utilisateur supprimé : suggestion quand même (aucun accès base)", async () => {
    actAsGhost('employee')
    ocrReturns(RECEIPT_TEXT)
    expect((await suggest({ receipt: receiptFile() })).status).toBe(200)
  })

  it.each<[string, Record<string, string | Blob>]>([
    ['reçu absent', {}],
    ['reçu envoyé comme texte', { receipt: 'recu.png' }],
  ])('400 « Champs invalides » : %s', async (_label, fields) => {
    actAs((await createOrg()).employee)
    const response = await suggest(fields)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Champs invalides' })
  })

  it("PDF : 200 {} sans lancer l'OCR", async () => {
    actAs((await createOrg()).employee)
    const response = await suggest({ receipt: receiptFile({ type: 'application/pdf', name: 'r.pdf' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('OCR en échec : 200 {}', async () => {
    actAs((await createOrg()).employee)
    vi.mocked(createWorker).mockRejectedValue(new Error('modèle introuvable'))
    const response = await suggest({ receipt: receiptFile() })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
  })

  it("[as-is] aucune limite de taille : un reçu de 11 Mo est passé à l'OCR (audit §5)", async () => {
    actAs((await createOrg()).employee)
    const worker = ocrReturns('')
    const size = 11 * 1024 * 1024
    expect((await suggest({ receipt: receiptFile({ size }) })).status).toBe(200)
    expect(worker.recognize.mock.calls[0][0]).toHaveLength(size)
  })

  it('[as-is] corps JSON → 500 avec stack', async () => {
    actAs((await createOrg()).employee)
    const response = await POST(jsonBody('/api/expense-notes/receipt-suggestion', 'POST', {}))
    expect(response.status).toBe(500)
    expect(await readJson<ErrorBody>(response)).toEqual({
      error: expect.stringContaining('Content-Type'),
      stack: expect.any(String),
    })
  })
})
