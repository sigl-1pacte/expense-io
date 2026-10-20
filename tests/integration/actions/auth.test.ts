import bcrypt from 'bcryptjs'
import { CredentialsSignin } from 'next-auth'
import { describe, expect, it } from 'vitest'
import { login, logout, signup } from '@/app/actions/auth'
import { testDb } from '../../support/db'
import { countRows } from '../../support/factories'
import { signInMock, signOutMock } from '../helpers/session'

const VALIDATION_ERROR = {
  error: 'Nom requis, email invalide, ou mot de passe trop court (8 caractères minimum).',
}
const VALID = { name: 'Alice Martin', email: 'alice@acme.fr', password: 'motdepasse' }

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

interface SignedUpUser {
  name: string
  email: string
  role: string
  manager_id: string | null
  company_id: string
  password_hash: string
  company_name: string
  email_domain: string
}

async function userByEmail(email: string): Promise<SignedUpUser> {
  const { rows } = await testDb().query<SignedUpUser>(
    `SELECT u.name, u.email, u.role, u.manager_id, u.company_id, u.password_hash,
            c.name AS company_name, c.email_domain
     FROM users u JOIN companies c ON c.id = u.company_id
     WHERE u.email = $1`,
    [email]
  )
  return rows[0]
}

describe('signup', () => {
  it.each<[string, Record<string, string>]>([
    ['nom absent', { email: VALID.email, password: VALID.password }],
    ["nom fait d'espaces", { ...VALID, name: '   ' }],
    ['email absent', { name: VALID.name, password: VALID.password }],
    ['email sans @', { ...VALID, email: 'alice.acme.fr' }],
    ['domaine sans point', { ...VALID, email: 'alice@acme' }],
    ['email avec espace', { ...VALID, email: 'alice martin@acme.fr' }],
    ['mot de passe absent', { name: VALID.name, email: VALID.email }],
    ['mot de passe de 7 caractères', { ...VALID, password: '1234567' }],
  ])('refuse : %s', async (_label, fields) => {
    expect(await signup({}, form(fields))).toEqual(VALIDATION_ERROR)
    expect(await countRows('users')).toBe(0)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it.each(['alice@gmail.com', 'bob@outlook.fr', 'carla@yahoo.fr'])(
    'refuse un domaine de messagerie publique (F4) : %s',
    async (email) => {
      expect(await signup({}, form({ ...VALID, email }))).toEqual({
        error: 'Utilise ton adresse professionnelle : les adresses de messagerie publique ne peuvent pas créer d’entreprise.',
      })
      expect(await countRows('companies')).toBe(0)
      expect(signInMock).not.toHaveBeenCalled()
    }
  )

  it("premier inscrit d'un domaine : crée l'entreprise et devient hr_admin", async () => {
    expect(await signup({}, form({ ...VALID, name: '  Alice Martin  ' }))).toEqual({})
    const user = await userByEmail(VALID.email)
    expect(user).toMatchObject({
      name: 'Alice Martin',
      role: 'hr_admin',
      manager_id: null,
      company_name: 'acme',
      email_domain: 'acme.fr',
    })
    expect(await bcrypt.compare(VALID.password, user.password_hash)).toBe(true)
    expect(bcrypt.getRounds(user.password_hash)).toBe(12)
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: VALID.email,
      password: VALID.password,
      redirectTo: '/expenses',
    })
  })

  it('accepte un mot de passe de 8 caractères pile', async () => {
    expect(await signup({}, form({ ...VALID, password: '12345678' }))).toEqual({})
  })

  it('inscrits suivants du même domaine : employés de la même entreprise, sans manager', async () => {
    await signup({}, form(VALID))
    await signup({}, form({ name: 'Bob', email: 'bob@acme.fr', password: 'motdepasse' }))
    const alice = await userByEmail(VALID.email)
    expect(await userByEmail('bob@acme.fr')).toMatchObject({
      role: 'employee',
      manager_id: null,
      company_id: alice.company_id,
    })
    expect(await countRows('companies')).toBe(1)
  })

  it("met le domaine en minuscules mais stocke l'email tel que saisi", async () => {
    await signup({}, form({ ...VALID, email: 'Alice@ACME.FR' }))
    expect(await userByEmail('Alice@ACME.FR')).toMatchObject({
      email: 'Alice@ACME.FR',
      company_name: 'acme',
      email_domain: 'acme.fr',
    })
  })

  it("[as-is] unicité de l'email sensible à la casse : deux comptes distincts", async () => {
    await signup({}, form(VALID))
    expect(await signup({}, form({ ...VALID, email: 'ALICE@acme.fr' }))).toEqual({})
    expect(await countRows('users')).toBe(2)
  })

  it('[as-is] un sous-domaine fonde une autre entreprise', async () => {
    await signup({}, form(VALID))
    await signup({}, form({ name: 'Bob', email: 'bob@paris.acme.fr', password: 'motdepasse' }))
    expect(await userByEmail('bob@paris.acme.fr')).toMatchObject({
      role: 'hr_admin',
      company_name: 'paris',
      email_domain: 'paris.acme.fr',
    })
    expect(await countRows('companies')).toBe(2)
  })

  it('refuse un email déjà inscrit', async () => {
    await signup({}, form(VALID))
    expect(await signup({}, form(VALID))).toEqual({ error: 'Un compte existe déjà avec cet email.' })
    expect(await countRows('users')).toBe(1)
    expect(signInMock).toHaveBeenCalledOnce()
  })

  it('connexion automatique en échec : compte créé quand même', async () => {
    signInMock.mockRejectedValueOnce(new CredentialsSignin())
    expect(await signup({}, form(VALID))).toEqual({
      error: 'Le compte a été créé mais la connexion automatique a échoué.',
    })
    expect(await countRows('users')).toBe(1)
  })

  it('relance les autres erreurs de signIn (dont la redirection de Next en production)', async () => {
    signInMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(signup({}, form(VALID))).rejects.toThrow('NEXT_REDIRECT')
    expect(await countRows('users')).toBe(1)
  })
})

describe('login', () => {
  it.each<[string, Record<string, string>]>([
    ['email absent', { password: 'secret' }],
    ['mot de passe absent', { email: 'alice@acme.fr' }],
  ])('%s → « Champs invalides. »', async (_label, fields) => {
    expect(await login({}, form(fields))).toEqual({ error: 'Champs invalides.' })
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('délègue à signIn avec redirection vers /expenses', async () => {
    expect(await login({}, form({ email: 'alice@acme.fr', password: 'secret' }))).toEqual({})
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: 'alice@acme.fr',
      password: 'secret',
      redirectTo: '/expenses',
    })
  })

  it('[as-is] champs vides transmis tels quels à signIn', async () => {
    await login({}, form({ email: '', password: '' }))
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: '',
      password: '',
      redirectTo: '/expenses',
    })
  })

  it('identifiants refusés → message générique', async () => {
    signInMock.mockRejectedValueOnce(new CredentialsSignin())
    expect(await login({}, form({ email: 'alice@acme.fr', password: 'faux' }))).toEqual({
      error: 'Email ou mot de passe incorrect.',
    })
  })

  it('relance les autres erreurs (dont la redirection de Next en production)', async () => {
    signInMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(login({}, form({ email: 'alice@acme.fr', password: 'secret' }))).rejects.toThrow(
      'NEXT_REDIRECT'
    )
  })
})

describe('logout', () => {
  it('déconnecte et redirige vers /login', async () => {
    await logout()
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: '/login' })
  })
})
