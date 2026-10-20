import type { Role } from '@/shared/actor'
import type { IamStore } from '../ports/IamStore'
import type { PasswordHasher } from '../ports/PasswordHasher'

export function authenticate(store: IamStore, hasher: PasswordHasher) {
  return async (email: string, password: string): Promise<{ id: string; email: string; role: Role } | null> => {
    const credentials = await store.credentialsFor(email)
    if (!credentials) return null
    if (!(await hasher.matches(password, credentials.passwordHash))) return null
    return { id: credentials.id, email: credentials.email, role: credentials.role }
  }
}
