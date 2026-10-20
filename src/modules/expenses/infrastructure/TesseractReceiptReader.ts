// F17 : les moteurs Tesseract sont créés une fois et réutilisés (au lieu d'un
// moteur par requête), et le nombre d'OCR simultanés est plafonné. Au-delà,
// les demandes attendent leur tour, au plus `queueTimeoutMs`, puis 503.
import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { Unavailable } from '@/shared/errors'
import type { ReceiptReader } from '../ports/ReceiptReader'

type Worker = Awaited<ReturnType<typeof createWorker>>

const TESSDATA_PATH = path.join(process.cwd(), 'tessdata')
const RETRY_AFTER_SECONDS = 5
const DEFAULT_MAX_CONCURRENCY = 2

/** Entier >= 1, sinon la valeur par défaut (une valeur absurde ne doit pas désactiver l'OCR). */
export function parseMaxConcurrency(raw: string | undefined): number {
  const value = Number(raw)
  return raw && Number.isInteger(value) && value >= 1 ? value : DEFAULT_MAX_CONCURRENCY
}

export class TesseractReceiptReader implements ReceiptReader {
  private readonly maxConcurrency: number
  private readonly queueTimeoutMs: number
  private readonly idle: Worker[] = []
  private readonly waiting: Array<() => void> = []
  private active = 0

  constructor(options: { maxConcurrency?: number; queueTimeoutMs?: number } = {}) {
    this.maxConcurrency = options.maxConcurrency ?? parseMaxConcurrency(process.env.OCR_MAX_CONCURRENCY)
    this.queueTimeoutMs = options.queueTimeoutMs ?? 30_000
  }

  async recognize(image: Uint8Array): Promise<string> {
    await this.acquire()
    try {
      const worker = this.idle.pop() ?? (await createWorker('fra', undefined, { langPath: TESSDATA_PATH, cacheMethod: 'none' }))
      try {
        const {
          data: { text },
        } = await worker.recognize(Buffer.from(image))
        this.idle.push(worker)
        return text
      } catch (error) {
        await worker.terminate().catch(() => undefined)
        throw error
      }
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer)
        this.active++
        resolve()
      }
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(grant), 1)
        reject(new Unavailable('Analyse de reçu momentanément saturée, réessaie dans quelques secondes.', RETRY_AFTER_SECONDS))
      }, this.queueTimeoutMs)
      this.waiting.push(grant)
    })
  }

  private release(): void {
    this.active--
    this.waiting.shift()?.()
  }
}
