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
})
