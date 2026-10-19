import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/shared/logger'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger', () => {
  it('écrit une ligne JSON sur stdout pour info', () => {
    logger.info('note décidée', { correlationId: 'c1', noteId: 'n1' })
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toEqual({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      level: 'info',
      message: 'note décidée',
      correlationId: 'c1',
      noteId: 'n1',
    })
  })

  it('écrit les erreurs sur stderr et sérialise une Error', () => {
    const error = new Error('boum')
    logger.error('échec', { error })
    const line = JSON.parse(vi.mocked(console.error).mock.calls[0][0] as string)
    expect(line.error).toEqual({ name: 'Error', message: 'boum', stack: error.stack })
  })

  it('ne lève pas sur un objet circulaire : la clé fautive devient "non sérialisable"', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => logger.info('circulaire', { correlationId: 'c1', payload: circular })).not.toThrow()
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toEqual({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      level: 'info',
      message: 'circulaire',
      correlationId: 'c1',
      payload: 'non sérialisable',
    })
  })

  it('ne lève pas sur un BigInt : seule la clé fautive devient "non sérialisable"', () => {
    expect(() => logger.warn('big', { n: BigInt(1), correlationId: 'c2' })).not.toThrow()
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toMatchObject({ level: 'warn', message: 'big', n: 'non sérialisable', correlationId: 'c2' })
  })

  it('ne lève pas si toJSON répond autrement à la seconde lecture (instantané)', () => {
    let reads = 0
    const unstable = {
      toJSON(): unknown {
        reads += 1
        if (reads === 1) return 'ok'
        const circular: Record<string, unknown> = {}
        circular.self = circular
        return circular
      },
    }
    expect(() => logger.info('instable', { t: unstable })).not.toThrow()
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toMatchObject({ level: 'info', message: 'instable', t: 'ok' })
  })

  it('ne lève pas si un getter de fields lève : fields devient "non sérialisable"', () => {
    const fields = {
      correlationId: 'c3',
      get boom(): unknown {
        throw new Error('getter en échec')
      },
    }
    expect(() => logger.info('getter', fields)).not.toThrow()
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toMatchObject({ level: 'info', message: 'getter', fields: 'non sérialisable' })
  })

  it('un champ undefined est omis de la ligne JSON', () => {
    logger.info('vide', { correlationId: 'c4', absent: undefined })
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).not.toHaveProperty('absent')
    expect(line).toMatchObject({ level: 'info', message: 'vide', correlationId: 'c4' })
  })

  it('un champ nommé level ne peut pas écraser le niveau', () => {
    logger.info('garde', { level: 'hacked', message: 'x', time: 'y' })
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toMatchObject({ level: 'info', message: 'garde' })
    expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
