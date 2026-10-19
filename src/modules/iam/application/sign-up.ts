import { companyNameFor, isPublicEmailDomain } from '../domain/Company'
import { EmailAlreadyUsed } from '../domain/errors'
import type { IamStore } from '../ports/IamStore'
import type { PasswordHasher } from '../ports/PasswordHasher'

export type SignUpResult = { ok: true } | { ok: false; error: string }

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/
const VALIDATION_ERROR = `Nom requis, email invalide, ou mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum).`

/** Premier inscrit d'un domaine : RH de la nouvelle entreprise ; suivants : employés sans manager. */
export function signUp(store: IamStore, hasher: PasswordHasher) {
  return async (input: { name?: unknown; email?: unknown; password?: unknown }): Promise<SignUpResult> => {
    const { name, email, password } = input
    const emailMatch = typeof email === 'string' ? EMAIL_PATTERN.exec(email) : null
    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      !emailMatch ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      password.length < MIN_PASSWORD_LENGTH
    ) {
      return { ok: false, error: VALIDATION_ERROR }
    }

    const domain = emailMatch[1].toLowerCase()
    if (isPublicEmailDomain(domain)) {
      return {
        ok: false,
        error: 'Utilise ton adresse professionnelle : les adresses de messagerie publique ne peuvent pas créer d’entreprise.',
      }
    }

    try {
      await store.createAccount({
        name: name.trim(),
        email,
        passwordHash: await hasher.hash(password),
        domain,
        companyName: companyNameFor(domain),
      })
    } catch (error) {
      if (error instanceof EmailAlreadyUsed) return { ok: false, error: 'Un compte existe déjà avec cet email.' }
      throw error
    }
    return { ok: true }
  }
}
