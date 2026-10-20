import { describe, expect, it } from 'vitest'
import { approveesOf } from '@/modules/iam/application/approvees-of'
import { assignManager } from '@/modules/iam/application/assign-manager'
import { authenticate } from '@/modules/iam/application/authenticate'
import { canDecide } from '@/modules/iam/application/can-decide'
import { getActor } from '@/modules/iam/application/get-actor'
import { getContact } from '@/modules/iam/application/get-contact'
import { listDirectory } from '@/modules/iam/application/list-directory'
import { signUp } from '@/modules/iam/application/sign-up'
import { InvalidManager } from '@/modules/iam/domain/errors'
import { FakeIamStore, fakeHasher, user } from './fake-iam-store'

const VALIDATION_ERROR = 'Nom requis, email invalide, ou mot de passe trop court (8 caractères minimum).'

function org() {
  return new FakeIamStore([
    user({ id: 'hr', role: 'hr_admin' }),
    user({ id: 'm1', role: 'manager' }),
    user({ id: 'm2', role: 'manager', managerId: 'm1' }),
    user({ id: 'e1', managerId: 'm2' }),
    user({ id: 'loose' }),
    user({ id: 'other', role: 'manager', companyId: 'globex' }),
  ])
}

describe('getActor (F31)', () => {
  it('relit le rôle en base', async () => {
    const store = org()
    store.users.find((u) => u.id === 'm1')!.role = 'employee'
    expect((await getActor(store)('m1')).role).toBe('employee')
  })

  it('acteur disparu : 401', async () => {
    await expect(getActor(org())('fantome')).rejects.toMatchObject({ status: 401 })
  })
})

describe('authenticate', () => {
  it('identifiants valides', async () => {
    expect(await authenticate(org(), fakeHasher)('e1@acme.fr', 'secret')).toEqual({
      id: 'e1',
      email: 'e1@acme.fr',
      role: 'employee',
    })
  })

  it.each([['e1@acme.fr', 'faux'], ['personne@acme.fr', 'secret']])('refus : %s / %s', async (email, password) => {
    expect(await authenticate(org(), fakeHasher)(email, password)).toBeNull()
  })
})

describe('signUp', () => {
  it('crée le compte', async () => {
    const store = new FakeIamStore()
    expect(await signUp(store, fakeHasher)({ name: '  Alice ', email: 'alice@acme.fr', password: 'motdepasse' })).toEqual({ ok: true })
    expect(store.users[0]).toMatchObject({ name: 'Alice', role: 'hr_admin', passwordHash: 'hash:motdepasse' })
  })

  it.each<[string, Record<string, unknown>]>([
    ['nom vide', { name: '  ', email: 'a@acme.fr', password: 'motdepasse' }],
    ['email invalide', { name: 'A', email: 'a@acme', password: 'motdepasse' }],
    ['mot de passe court', { name: 'A', email: 'a@acme.fr', password: '1234567' }],
    ['champ absent', { name: 'A', email: 'a@acme.fr' }],
  ])('refus de validation : %s', async (_label, input) => {
    expect(await signUp(new FakeIamStore(), fakeHasher)(input as never)).toEqual({ ok: false, error: VALIDATION_ERROR })
  })

  it.each(['a@acme', 'a@.fr', 'a@acme.', '@acme.fr', 'a b@acme.fr', 'a@ac me.fr', 'a@b@acme.fr', 'a@acme.fr ', ''])(
    'email invalide : %j',
    async (email) => {
      expect(await signUp(new FakeIamStore(), fakeHasher)({ name: 'A', email, password: 'motdepasse' })).toEqual({
        ok: false,
        error: VALIDATION_ERROR,
      })
    }
  )

  it.each([
    ['a@acme.fr', 'acme.fr'],
    ['A.B+tag@Sub.ACME.fr', 'sub.acme.fr'],
    ['a@..fr', '..fr'],
    ['a@acme..fr', 'acme..fr'],
  ])('email valide : %s → domaine %s', async (email, domain) => {
    const store = new FakeIamStore()
    expect(await signUp(store, fakeHasher)({ name: 'A', email, password: 'motdepasse' })).toEqual({ ok: true })
    // Premier inscrit : le faux magasin prend le domaine comme identifiant d'entreprise.
    expect(store.users[0]).toMatchObject({ email, companyId: domain })
  })

  it('refuse un domaine de messagerie publique (F4)', async () => {
    const store = new FakeIamStore()
    expect(await signUp(store, fakeHasher)({ name: 'G', email: 'g@gmail.com', password: 'motdepasse' })).toEqual({
      ok: false,
      error: 'Utilise ton adresse professionnelle : les adresses de messagerie publique ne peuvent pas créer d’entreprise.',
    })
    expect(store.users).toEqual([])
  })

  it('email déjà utilisé (F12)', async () => {
    expect(await signUp(org(), fakeHasher)({ name: 'X', email: 'e1@acme.fr', password: 'motdepasse' })).toEqual({
      ok: false,
      error: 'Un compte existe déjà avec cet email.',
    })
  })
})

describe('assignManager (F5, F30)', () => {
  const hr = { id: 'hr', companyId: 'acme', role: 'hr_admin' as const, managerId: null }

  it('verrouille l’organigramme puis rattache', async () => {
    const store = org()
    expect(await assignManager(store)(hr, 'loose', 'm1')).toMatchObject({ id: 'loose', managerId: 'm1' })
    expect(store.locks).toBe(1)
  })

  it('refuse un manager d’une autre entreprise (F5)', async () => {
    await expect(assignManager(org())(hr, 'loose', 'other')).rejects.toThrow(InvalidManager)
  })

  it('refuse un cycle (F30)', async () => {
    await expect(assignManager(org())(hr, 'm1', 'm2')).rejects.toThrow(InvalidManager)
  })
})

describe('approveesOf / canDecide / listDirectory / getContact', () => {
  const m2 = { id: 'm2', companyId: 'acme', role: 'manager' as const, managerId: 'm1' }
  const hr = { id: 'hr', companyId: 'acme', role: 'hr_admin' as const, managerId: null }

  it('approveesOf', async () => {
    expect(await approveesOf(org())(m2)).toEqual(['e1'])
    expect(await approveesOf(org())(hr)).toEqual(['m1', 'loose'])
  })

  it('canDecide, propriétaire inconnu ou d’une autre entreprise : false', async () => {
    expect(await canDecide(org())(m2, 'e1')).toBe(true)
    expect(await canDecide(org())(m2, 'other')).toBe(false)
    expect(await canDecide(org())(m2, 'inconnu')).toBe(false)
  })

  it('listDirectory exclut les RH', async () => {
    expect((await listDirectory(org())(hr)).map((u) => u.id)).toEqual(['m1', 'm2', 'e1', 'loose'])
  })

  it('getContact', async () => {
    expect(await getContact(org())(m2, 'e1')).toEqual({ name: 'e1', email: 'e1@acme.fr' })
  })
})
