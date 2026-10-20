import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3ReceiptStorage } from '@/modules/expenses/infrastructure/S3ReceiptStorage'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('S3ReceiptStorage', () => {
  it('signe une URL avec la configuration par défaut', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:4566')
    vi.stubEnv('S3_ACCESS_KEY_ID', 'test')
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test')
    vi.stubEnv('S3_REGION', undefined)
    vi.stubEnv('S3_BUCKET', undefined)
    const url = await new S3ReceiptStorage().signedUrl('receipts/1.png')
    expect(url).toContain('/receipts/receipts/1.png')
  })

  it('accepte un bucket explicite et le style virtual-hosted', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:4566')
    vi.stubEnv('S3_ACCESS_KEY_ID', 'test')
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test')
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'false')
    const storage = new S3ReceiptStorage('autre')
    expect(await storage.signedUrl('receipts/2.png')).toContain('autre')
  })
})
