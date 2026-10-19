import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { TesseractReceiptReader } from '@/modules/expenses/infrastructure/TesseractReceiptReader'
import { Unavailable } from '@/shared/errors'

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))
type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

function fakeWorker(recognize: () => Promise<{ data: { text: string } }>) {
  return { recognize: vi.fn(recognize), terminate: vi.fn().mockResolvedValue(undefined) }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TesseractReceiptReader (F17)', () => {
  it('crée un seul moteur français, avec le modèle local, et le réutilise', async () => {
    const worker = fakeWorker(async () => ({ data: { text: 'TOTAL 1,00' } }))
    vi.mocked(createWorker).mockResolvedValue(worker as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1 })
    expect(await reader.recognize(new Uint8Array([1]))).toBe('TOTAL 1,00')
    expect(await reader.recognize(new Uint8Array([2]))).toBe('TOTAL 1,00')
    expect(createWorker).toHaveBeenCalledOnce()
    expect(createWorker).toHaveBeenCalledWith('fra', undefined, { langPath: expect.stringMatching(/tessdata$/), cacheMethod: 'none' })
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it('jette un moteur qui a échoué et en recrée un au prochain appel', async () => {
    const broken = fakeWorker(async () => Promise.reject(new Error('crash')))
    const healthy = fakeWorker(async () => ({ data: { text: 'ok' } }))
    vi.mocked(createWorker)
      .mockResolvedValueOnce(broken as unknown as TesseractWorker)
      .mockResolvedValueOnce(healthy as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1 })
    await expect(reader.recognize(new Uint8Array([1]))).rejects.toThrow('crash')
    expect(broken.terminate).toHaveBeenCalledOnce()
    expect(await reader.recognize(new Uint8Array([1]))).toBe('ok')
  })

  it('au-delà du plafond, la demande attend puis reçoit Unavailable (503, Retry-After)', async () => {
    let release!: () => void
    const slow = fakeWorker(
      () => new Promise((resolve) => (release = () => resolve({ data: { text: 'lent' } })))
    )
    vi.mocked(createWorker).mockResolvedValue(slow as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1, queueTimeoutMs: 50 })
    const first = reader.recognize(new Uint8Array([1]))
    const second = reader.recognize(new Uint8Array([2]))
    await expect(second).rejects.toBeInstanceOf(Unavailable)
    await expect(second).rejects.toMatchObject({ status: 503, headers: { 'retry-after': '5' } })
    release()
    expect(await first).toBe('lent')
  })

  it('une demande en file passe dès qu’une place se libère, sur le même moteur', async () => {
    const worker = fakeWorker(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { text: 'a' } }), 20))
    )
    vi.mocked(createWorker).mockResolvedValue(worker as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1, queueTimeoutMs: 5_000 })
    const results = await Promise.all([
      reader.recognize(new Uint8Array([1])),
      reader.recognize(new Uint8Array([2])),
    ])
    expect(results).toEqual(['a', 'a'])
    expect(createWorker).toHaveBeenCalledOnce()
    expect(worker.recognize).toHaveBeenCalledTimes(2)
  })
})
