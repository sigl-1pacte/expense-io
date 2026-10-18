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

  it('ne lève pas sur un objet circulaire et écrit fields "non sérialisable"', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => logger.info('circulaire', { payload: circular })).not.toThrow()
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toEqual({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      level: 'info',
      message: 'circulaire',
      fields: 'non sérialisable',
    })
  })

  it('ne lève pas sur un BigInt', () => {
    expect(() => logger.warn('big', { n: BigInt(1) })).not.toThrow()
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toMatchObject({ level: 'warn', message: 'big', fields: 'non sérialisable' })
  })

  it('un champ nommé level ne peut pas écraser le niveau', () => {
    logger.info('garde', { level: 'hacked', message: 'x', time: 'y' })
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toMatchObject({ level: 'info', message: 'garde' })
    expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
