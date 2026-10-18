'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { getPool } from '@/lib/db'
import { signIn, signOut } from '@/lib/auth'

export interface AuthFormState {
  error?: string
}

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = formData.get('name')
  const email = formData.get('email')
  const password = formData.get('password')

  const emailMatch = typeof email === 'string' ? EMAIL_PATTERN.exec(email) : null
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    !emailMatch ||
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH
  ) {
    return {
      error: `Nom requis, email invalide, ou mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum).`,
    }
  }

  const domain = emailMatch[1].toLowerCase()
  const companyName = domain.split('.')[0]
  const passwordHash = await bcrypt.hash(password, 12)

  // Une transaction côté base (F11) ; un email déjà pris, même par une
  // inscription concurrente (F12), lève une violation d'unicité.
  try {
    await getPool().query('SELECT * FROM app.sign_up($1, $2, $3, $4, $5)', [
      name.trim(),
      email,
      passwordHash,
      domain,
      companyName,
    ])
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return { error: 'Un compte existe déjà avec cet email.' }
    }
    throw error
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Le compte a été créé mais la connexion automatique a échoué.' }
    }
    throw error
  }
  return {}
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Champs invalides.' }
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Email ou mot de passe incorrect.' }
    }
    throw error
  }
  return {}
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}
