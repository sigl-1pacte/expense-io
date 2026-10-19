import { describe, expect, it } from 'vitest'
import { signUp } from '@/modules/iam/application/sign-up'
import { FakeIamStore } from './fake-iam-store'

describe('signUp — erreur inattendue', () => {
  it('relance une erreur autre que « email déjà utilisé »', async () => {
    const store = new FakeIamStore()
    store.createAccount = async () => {
      throw new Error('base indisponible')
    }
    const hasher = { hash: async (p: string) => `hash:${p}`, matches: async () => true }
    await expect(signUp(store, hasher)({ name: 'A', email: 'a@acme.fr', password: 'motdepasse' })).rejects.toThrow(
      'base indisponible'
    )
  })
})
