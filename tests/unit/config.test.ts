import { describe, expect, it } from 'vitest'
import { loadConfig } from '@/shared/config'

const SECRET = 'a'.repeat(32)

describe('loadConfig', () => {
  it('lit AUTH_SECRET', () => {
    expect(loadConfig({ AUTH_SECRET: SECRET }).authSecret).toBe(SECRET)
  })

  it.each<[string, Record<string, string | undefined>]>([
    ['absent', {}],
    ['vide', { AUTH_SECRET: '' }],
    ['trop court (31 caractères)', { AUTH_SECRET: 'a'.repeat(31) }],
  ])('refuse un AUTH_SECRET %s', (_label, env) => {
    expect(() => loadConfig(env)).toThrow('AUTH_SECRET manquant ou trop court (32 caractères minimum)')
  })
})
