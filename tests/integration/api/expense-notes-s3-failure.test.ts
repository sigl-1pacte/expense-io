import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/expense-notes/route'
import { uploadReceipt } from '@/lib/storage'
import { testDb } from '../../support/db'
import { createOrg } from '../../support/factories'
import { multipart, readJson, receiptFile, type ErrorBody } from '../helpers/http'
import { actAs } from '../helpers/session'

// Mock partiel, limité à ce fichier : le vrai uploadReceipt reste
// l'implémentation par défaut (restaurée par vi.resetAllMocks entre tests).
vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>()
  return { ...actual, uploadReceipt: vi.fn(actual.uploadReceipt) }
})

describe('POST /api/expense-notes — panne du stockage', () => {
  it('[as-is] la note reste en base avec receipt_key vide et la réponse est une 500 (audit §5)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    vi.mocked(uploadReceipt).mockRejectedValueOnce(new Error('S3 indisponible'))
    const response = await POST(
      multipart('/api/expense-notes', {
        amount: '42.5',
        expenseDate: '2026-10-08',
        description: 'Taxi',
        receipt: receiptFile(),
      })
    )
    expect(response.status).toBe(500)
    expect(await readJson<ErrorBody>(response)).toEqual({
      error: 'S3 indisponible',
      stack: expect.any(String),
    })
    const { rows } = await testDb().query('SELECT receipt_key, status FROM expense_notes')
    expect(rows).toEqual([{ receipt_key: '', status: 'pending' }])
  })
})
