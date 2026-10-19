import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPool } from '@/shared/db'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getPool', () => {
  it('exige DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', '')
    const saved = global.__pgPool
    global.__pgPool = undefined
    try {
      expect(() => getPool()).toThrow('DATABASE_URL is not set')
    } finally {
      global.__pgPool = saved
    }
  })
})
