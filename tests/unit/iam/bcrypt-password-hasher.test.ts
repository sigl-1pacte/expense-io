import { describe, expect, it } from 'vitest'
import { BcryptPasswordHasher } from '@/modules/iam/infrastructure/BcryptPasswordHasher'

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher(4)

  it('hache puis reconnaît le mot de passe', async () => {
    const hash = await hasher.hash('secret')
    expect(hash).not.toBe('secret')
    await expect(hasher.matches('secret', hash)).resolves.toBe(true)
  })

  it('refuse un autre mot de passe', async () => {
    const hash = await hasher.hash('secret')
    await expect(hasher.matches('autre', hash)).resolves.toBe(false)
  })
})
