import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/expense-notes/route'
import { S3ReceiptStorage } from '@/modules/expenses/infrastructure/S3ReceiptStorage'
import { countRows, createOrg } from '../../support/factories'
import { expectProblem, multipart, receiptFile } from '../helpers/http'
import { actAs } from '../helpers/session'

describe('POST /api/expense-notes — panne du stockage (F10)', () => {
  it('502, aucune note créée', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    vi.spyOn(S3ReceiptStorage.prototype, 'upload').mockRejectedValueOnce(new Error('S3 indisponible'))
    const response = await POST(
      multipart('/api/expense-notes', {
        amount: '42.5',
        expenseDate: '2026-10-08',
        description: 'Taxi',
        receipt: receiptFile(),
      })
    )
    await expectProblem(response, 502, 'Stockage des reçus indisponible')
    expect(await countRows('expense_notes')).toBe(0)
  })
})
